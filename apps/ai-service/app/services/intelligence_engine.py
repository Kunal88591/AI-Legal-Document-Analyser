from __future__ import annotations

import io
import json
import os
import re
import sqlite3
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple

import numpy as np
import requests
import spacy
from dateutil import parser as date_parser
from sentence_transformers import SentenceTransformer

try:
    import chromadb
except Exception:  # pragma: no cover
    chromadb = None

try:
    import fitz  # PyMuPDF
except Exception:  # pragma: no cover
    fitz = None

try:
    import pdfplumber
except Exception:  # pragma: no cover
    pdfplumber = None

try:
    import pytesseract
except Exception:  # pragma: no cover
    pytesseract = None

try:
    from PIL import Image, ImageFilter, ImageOps
except Exception:  # pragma: no cover
    Image = None
    ImageFilter = None
    ImageOps = None


CLAUSE_KEYWORDS = {
    "termination": ["terminate", "termination", "without cause", "for cause", "notice period"],
    "confidentiality": ["confidential", "confidentiality", "non-disclosure", "nda", "trade secret"],
    "indemnity": ["indemnify", "indemnity", "hold harmless"],
    "liability": ["liability", "liable", "damages", "limitation of liability"],
    "payment": ["payment", "fee", "fees", "compensation", "salary", "invoice", "billing"],
    "renewal": ["renewal", "auto-renew", "renew", "extension"],
    "notice": ["notice", "notify", "notification"],
    "arbitration": ["arbitration", "dispute resolution", "jurisdiction", "venue"],
    "non_compete": ["non-compete", "non compete", "restrictive covenant", "non-solicit"],
    "assignment": ["assignment", "assign", "transfer", "subcontract"],
}

RISK_KEYWORDS = {
    "high": ["unlimited", "sole discretion", "immediately", "without notice", "penalty", "liquidated damages", "non-compete", "forfeiture"],
    "medium": ["material breach", "may terminate", "should", "reasonable", "best efforts", "auto-renew", "liability"],
    "low": ["review", "consent", "approval", "standard", "ordinary course"],
}

DATE_PATTERNS = [
    r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
    r"\b\d{1,2}\s+[A-Za-z]+\s+\d{4}\b",
    r"\b[A-Za-z]+\s+\d{1,2},\s+\d{4}\b",
]

MONEY_PATTERN = r"(?:[$₹€£]\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b)"
DURATION_PATTERN = r"\b\d+\s*(?:day|days|week|weeks|month|months|year|years)\b"


def _ensure_dir(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _normalize_spaces(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def _safe_json_loads(value: Optional[str], default: Any) -> Any:
    if not value:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _split_sentences(text: str, nlp) -> List[str]:
    doc = nlp(text or "")
    return [sentence.text.strip() for sentence in doc.sents if sentence.text.strip()]


@dataclass
class Chunk:
    chunk_id: str
    document_id: str
    text: str
    chunk_index: int
    line_start: int
    line_end: int
    label: str
    risk: str
    metadata: Dict[str, Any]


class Storage:
    def __init__(self, db_path: Path):
        self.db_path = db_path
        _ensure_dir(db_path.parent)
        self._init_db()

    def _conn(self):
        return sqlite3.connect(self.db_path)

    def _init_db(self):
        with self._conn() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS documents (
                    document_id TEXT PRIMARY KEY,
                    file_name TEXT NOT NULL,
                    jurisdiction TEXT,
                    extraction_method TEXT,
                    ocr_recommended INTEGER,
                    ocr_confidence REAL,
                    analysis_json TEXT,
                    text_blob TEXT,
                    created_at TEXT
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS conversations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id TEXT NOT NULL,
                    role TEXT NOT NULL,
                    content TEXT NOT NULL,
                    citations_json TEXT,
                    created_at TEXT NOT NULL
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS analyses (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    document_id TEXT NOT NULL,
                    result_json TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )

    def upsert_document(self, document_id: str, file_name: str, jurisdiction: str, extraction_method: str, ocr_recommended: bool, ocr_confidence: float, text_blob: str, analysis: Dict[str, Any]) -> None:
        with self._conn() as conn:
            conn.execute(
                """
                INSERT INTO documents (document_id, file_name, jurisdiction, extraction_method, ocr_recommended, ocr_confidence, analysis_json, text_blob, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(document_id) DO UPDATE SET
                    file_name=excluded.file_name,
                    jurisdiction=excluded.jurisdiction,
                    extraction_method=excluded.extraction_method,
                    ocr_recommended=excluded.ocr_recommended,
                    ocr_confidence=excluded.ocr_confidence,
                    analysis_json=excluded.analysis_json,
                    text_blob=excluded.text_blob
                """,
                (
                    document_id,
                    file_name,
                    jurisdiction,
                    extraction_method,
                    int(ocr_recommended),
                    float(ocr_confidence),
                    json.dumps(analysis),
                    text_blob,
                    _now_iso(),
                ),
            )

    def save_analysis(self, document_id: str, result: Dict[str, Any]) -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO analyses (document_id, result_json, created_at) VALUES (?, ?, ?)",
                (document_id, json.dumps(result), _now_iso()),
            )

    def save_message(self, document_id: str, role: str, content: str, citations: Optional[List[Dict[str, Any]]] = None) -> None:
        with self._conn() as conn:
            conn.execute(
                "INSERT INTO conversations (document_id, role, content, citations_json, created_at) VALUES (?, ?, ?, ?, ?)",
                (document_id, role, content, json.dumps(citations or []), _now_iso()),
            )

    def get_history(self, document_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT role, content, citations_json, created_at FROM conversations WHERE document_id = ? ORDER BY id DESC LIMIT ?",
                (document_id, limit),
            ).fetchall()
        history = []
        for role, content, citations_json, created_at in reversed(rows):
            history.append({
                "role": role,
                "content": content,
                "citations": _safe_json_loads(citations_json, []),
                "timestamp": created_at,
            })
        return history

    def get_document(self, document_id: str) -> Optional[Dict[str, Any]]:
        with self._conn() as conn:
            row = conn.execute(
                "SELECT document_id, file_name, jurisdiction, extraction_method, ocr_recommended, ocr_confidence, analysis_json, text_blob, created_at FROM documents WHERE document_id = ?",
                (document_id,),
            ).fetchone()
        if not row:
            return None
        return {
            "document_id": row[0],
            "file_name": row[1],
            "jurisdiction": row[2],
            "extraction_method": row[3],
            "ocr_recommended": bool(row[4]),
            "ocr_confidence": float(row[5] or 0.0),
            "analysis": _safe_json_loads(row[6], {}),
            "text_blob": row[7] or "",
            "created_at": row[8],
        }


class VectorIndex:
    def __init__(self, base_dir: Path, embedder: SentenceTransformer):
        self.base_dir = base_dir
        self.embedder = embedder
        _ensure_dir(base_dir)
        self.client = chromadb.PersistentClient(path=str(base_dir)) if chromadb else None
        self.collection = None if self.client is None else self.client.get_or_create_collection(name="legal_documents")

    def upsert(self, chunks: Sequence[Chunk]) -> None:
        if not self.collection or not chunks:
            return
        embeddings = self.embedder.encode([chunk.text for chunk in chunks], normalize_embeddings=True).tolist()
        self.collection.upsert(
            ids=[chunk.chunk_id for chunk in chunks],
            documents=[chunk.text for chunk in chunks],
            metadatas=[{
                **chunk.metadata,
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "chunk_index": chunk.chunk_index,
                "line_start": chunk.line_start,
                "line_end": chunk.line_end,
                "label": chunk.label,
                "risk": chunk.risk,
            } for chunk in chunks],
            embeddings=embeddings,
        )

    def search(self, document_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        if not self.collection:
            return []
        query_embedding = self.embedder.encode([query], normalize_embeddings=True).tolist()
        result = self.collection.query(
            query_embeddings=query_embedding,
            n_results=max(1, top_k),
            where={"document_id": document_id},
            include=["documents", "metadatas", "distances"],
        )
        records = []
        docs = result.get("documents", [[]])[0]
        metas = result.get("metadatas", [[]])[0]
        distances = result.get("distances", [[]])[0]
        for index, text in enumerate(docs):
            metadata = metas[index] if index < len(metas) else {}
            distance = distances[index] if index < len(distances) else None
            records.append({"text": text, "metadata": metadata, "distance": distance})
        return records


class IntelligenceEngine:
    def __init__(self):
        base_dir = Path(os.environ.get("LEGAL_DATA_DIR", "./data")).resolve()
        self.storage = Storage(base_dir / "legal_intelligence.db")
        self.embedder = SentenceTransformer(os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2"))
        self.vector_index = VectorIndex(base_dir / "chroma", self.embedder)
        self.ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        self.ollama_model = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")
        self.max_context_chunks = int(os.environ.get("MAX_CONTEXT_CHUNKS", "4"))
        self.max_chunk_words = int(os.environ.get("MAX_CHUNK_WORDS", "180"))
        self.nlp = self._build_spacy_pipeline()

    def _build_spacy_pipeline(self):
        try:
            model = spacy.load("en_core_web_sm")
        except Exception:
            model = spacy.blank("en")
        if "sentencizer" not in model.pipe_names:
            model.add_pipe("sentencizer")
        return model

    def _chunk_text(self, text: str) -> List[Tuple[int, int, str]]:
        lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
        if not lines:
            return []
        chunks: List[Tuple[int, int, str]] = []
        current: List[str] = []
        start = 1
        word_count = 0
        for index, line in enumerate(lines, start=1):
            line_words = len(line.split())
            if current and word_count + line_words > self.max_chunk_words:
                chunks.append((start, index - 1, "\n".join(current).strip()))
                current = []
                word_count = 0
                start = index
            current.append(line)
            word_count += line_words
        if current:
            chunks.append((start, start + len(current) - 1, "\n".join(current).strip()))
        return chunks

    def _classify_clause(self, text: str) -> Tuple[str, str]:
        lowered = text.lower()
        for label, keywords in CLAUSE_KEYWORDS.items():
            if any(keyword in lowered for keyword in keywords):
                return label.replace("_", " ").title(), self._risk_from_text(lowered)
        return "General Clause", self._risk_from_text(lowered)

    def _risk_from_text(self, lowered_text: str) -> str:
        for risk, keywords in RISK_KEYWORDS.items():
            if any(keyword in lowered_text for keyword in keywords):
                return risk.title()
        return "Low"

    def _risk_score(self, clause_labels: List[str], highlights: List[Dict[str, Any]]) -> int:
        counts = Counter(clause_labels)
        score = len([item for item in highlights if item["severity"] == "high"]) * 17
        score += len([item for item in highlights if item["severity"] == "medium"]) * 9
        score += len([item for item in highlights if item["severity"] == "low"]) * 3
        score += counts.get("Termination", 0) * 7
        score += counts.get("Indemnity", 0) * 9
        score += counts.get("Liability", 0) * 8
        return min(100, score)

    def _risk_label(self, score: int) -> str:
        if score >= 70:
            return "High"
        if score >= 40:
            return "Moderate"
        return "Low"

    def _detect_contract_type(self, text: str) -> str:
        lowered = text.lower()
        if any(term in lowered for term in ["employment", "employee", "salary"]):
            return "Employment"
        if any(term in lowered for term in ["lease", "tenant", "landlord"]):
            return "Lease"
        if any(term in lowered for term in ["service", "consulting", "statement of work"]):
            return "Service Agreement"
        if any(term in lowered for term in ["license", "licence"]):
            return "License"
        if any(term in lowered for term in ["non-disclosure", "nda", "confidential"]):
            return "Non-Disclosure"
        return "General Contract"

    def _extract_facts(self, text: str) -> Dict[str, Any]:
        facts = {
            "dates": [],
            "money": re.findall(MONEY_PATTERN, text or ""),
            "durations": re.findall(DURATION_PATTERN, text or "", flags=re.IGNORECASE),
            "renewalDates": [],
            "deadlines": [],
            "noticePeriods": [],
        }
        for pattern in DATE_PATTERNS:
            facts["dates"].extend(re.findall(pattern, text or "", flags=re.IGNORECASE))
        for match in re.finditer(r"(\d{1,3})\s*(days?|months?|years?)\s*(notice)?", text or "", flags=re.IGNORECASE):
            facts["noticePeriods"].append(" ".join(match.groups(default="")).strip())
        return facts

    def _build_chunks(self, document_id: str, text: str, file_name: str, jurisdiction: str) -> List[Chunk]:
        chunks: List[Chunk] = []
        for index, (line_start, line_end, chunk_text) in enumerate(self._chunk_text(text), start=1):
            label, risk = self._classify_clause(chunk_text)
            chunks.append(Chunk(
                chunk_id=f"{document_id}:{index}",
                document_id=document_id,
                text=chunk_text,
                chunk_index=index,
                line_start=line_start,
                line_end=line_end,
                label=label,
                risk=risk,
                metadata={
                    "fileName": file_name,
                    "jurisdiction": jurisdiction,
                },
            ))
        return chunks

    def _build_highlights(self, lines: Sequence[str]) -> Tuple[List[Dict[str, Any]], List[str]]:
        highlights: List[Dict[str, Any]] = []
        tags: List[str] = []
        seen = set()
        for line_number, line in enumerate(lines, start=1):
            lowered = line.lower()
            severity = "neutral"
            for risk, keywords in RISK_KEYWORDS.items():
                if any(keyword in lowered for keyword in keywords):
                    severity = risk
                    break
            if any(keyword in lowered for keyword in CLAUSE_KEYWORDS.get("payment", [])) and severity == "neutral":
                severity = "medium"
            if severity != "neutral":
                highlights.append({"lineNumber": line_number, "text": line, "severity": severity})
            for label, keywords in CLAUSE_KEYWORDS.items():
                if any(keyword in lowered for keyword in keywords) and label not in seen:
                    tags.append(f"#{label.replace('_', '').title()}")
                    seen.add(label)
        return highlights, tags

    def _build_summary_points(self, contract_type: str, facts: Dict[str, Any], risk_label: str, tags: List[str]) -> List[str]:
        duration = facts["durations"][0] if facts["durations"] else "Not clearly stated"
        notice = facts["noticePeriods"][0] if facts["noticePeriods"] else "Not specified"
        top_tag = tags[0] if tags else "#General"
        return [
            f"Contract type: {contract_type}",
            f"Duration: {duration}",
            f"Notice period: {notice}",
            f"Primary clause focus: {top_tag.lstrip('#')}",
            f"Overall risk: {risk_label}",
        ]

    def _extract_timeline(self, text: str, facts: Dict[str, Any]) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        date_texts = list(dict.fromkeys(facts["dates"]))
        keywords = ["renew", "notice", "deadline", "terminate", "payment", "invoice", "expiration", "expiry"]
        lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
        for line in lines:
            lowered = line.lower()
            if not any(keyword in lowered for keyword in keywords):
                continue
            date_match = None
            for candidate in date_texts:
                if candidate in line:
                    date_match = candidate
                    break
            urgency = "normal"
            if any(keyword in lowered for keyword in ["terminate", "default", "penalty", "breach"]):
                urgency = "high"
            elif any(keyword in lowered for keyword in ["renew", "notice", "invoice", "payment"]):
                urgency = "medium"
            events.append({
                "label": self._timeline_label(lowered),
                "value": date_match or line[:140],
                "context": line,
                "urgency": urgency,
            })
        if not events:
            for index, date_text in enumerate(date_texts[:5], start=1):
                events.append({
                    "label": f"Date {index}",
                    "value": date_text,
                    "context": date_text,
                    "urgency": "medium",
                })
        return events[:12]

    def _timeline_label(self, lowered_line: str) -> str:
        if "renew" in lowered_line:
            return "Renewal"
        if "notice" in lowered_line:
            return "Notice"
        if "payment" in lowered_line or "invoice" in lowered_line:
            return "Payment"
        if "terminate" in lowered_line or "termination" in lowered_line:
            return "Termination"
        return "Milestone"

    def _build_graph(self, chunks: List[Chunk], events: List[Dict[str, Any]]) -> Dict[str, Any]:
        nodes: List[Dict[str, Any]] = []
        edges: List[Dict[str, Any]] = []
        for chunk in chunks[:18]:
            risk_rank = {"High": 3, "Medium": 2, "Low": 1}.get(chunk.risk, 1)
            nodes.append({
                "id": chunk.chunk_id,
                "label": chunk.label,
                "risk": chunk.risk,
                "riskScore": risk_rank,
                "text": chunk.text[:220],
                "type": "clause",
                "lineStart": chunk.line_start,
                "lineEnd": chunk.line_end,
            })
        for index in range(len(nodes) - 1):
            edges.append({
                "id": f"edge-{index}-{index+1}",
                "source": nodes[index]["id"],
                "target": nodes[index + 1]["id"],
                "label": "follows",
            })
        for event in events:
            node_id = f"event-{uuid.uuid4().hex[:8]}"
            nodes.append({
                "id": node_id,
                "label": event["label"],
                "risk": event["urgency"].title(),
                "riskScore": 2 if event["urgency"] == "high" else 1,
                "text": event["context"][:220],
                "type": "event",
            })
            if chunks:
                edges.append({
                    "id": f"edge-{node_id}-{chunks[0].chunk_id}",
                    "source": chunks[0].chunk_id,
                    "target": node_id,
                    "label": event["label"].lower(),
                })
        return {"nodes": nodes, "edges": edges}

    def _build_obligations(self, events: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        obligations = []
        for index, event in enumerate(events, start=1):
            obligations.append({
                "id": f"obligation-{index}",
                "label": event["label"],
                "deadline": event["value"],
                "urgency": event["urgency"],
                "status": "upcoming" if event["urgency"] != "high" else "urgent",
                "description": event["context"],
            })
        return obligations

    def _persist_and_index(self, document_id: str, file_name: str, jurisdiction: str, text: str, extraction_method: str, ocr_recommended: bool, ocr_confidence: float, analysis: Dict[str, Any]) -> None:
        self.storage.upsert_document(document_id, file_name, jurisdiction, extraction_method, ocr_recommended, ocr_confidence, text, analysis)
        self.storage.save_analysis(document_id, analysis)
        chunks = self._build_chunks(document_id, text, file_name, jurisdiction)
        self.vector_index.upsert(chunks)

    def analyze_document(self, document_id: str, file_name: str, jurisdiction: str, text: str, file_bytes: Optional[bytes], extraction_method: str, ocr_recommended: bool) -> Dict[str, Any]:
        content = text or ""
        warnings: List[str] = []
        ocr_confidence = 0.0
        if (not content.strip() or len(content.strip()) < 180) and file_bytes:
            ocr_text, ocr_log, confidence = self._ocr_fallback(file_bytes)
            if ocr_text.strip():
                content = ocr_text
            warnings.extend(ocr_log)
            ocr_recommended = True if ocr_log else ocr_recommended
            ocr_confidence = confidence
        elif content.strip():
            ocr_confidence = min(0.98, max(0.25, len(content.strip()) / 2500.0))

        lines = [line for line in content.splitlines() if line.strip()]
        sentences = _split_sentences(content, self.nlp)
        highlights, tags = self._build_highlights(lines)
        facts = self._extract_facts(content)
        contract_type = self._detect_contract_type(content)
        clauses = []
        for index, sentence in enumerate(sentences[:120], start=1):
            label, risk = self._classify_clause(sentence)
            if label == "General Clause" and not any(keyword in sentence.lower() for keyword in ["shall", "must", "may", "will"]):
                continue
            clauses.append({
                "id": f"{document_id}-clause-{index}",
                "label": label,
                "text": sentence,
                "risk": risk,
                "index": index,
            })

        risk_score = self._risk_score([clause["label"] for clause in clauses], highlights)
        if jurisdiction and jurisdiction.lower() in {"india", "eu"} and any(tag.lower() == "#noncompete" for tag in tags):
            risk_score = min(100, risk_score + 6)
        risk_label = self._risk_label(risk_score)
        summary_points = self._build_summary_points(contract_type, facts, risk_label, tags)
        summary = " ".join(content.split()[:110]).strip()
        if summary:
            summary += "..."
        simple_summary = self._simplify_text(summary or content[:1200])
        timeline = self._extract_timeline(content, facts)
        obligations = self._build_obligations(timeline)
        graph = self._build_graph(self._build_chunks(document_id, content, file_name, jurisdiction), timeline)
        qa = self._answer_questions(content, risk_label, risk_score, tags)

        result = {
            "documentId": document_id,
            "fileName": file_name,
            "jurisdiction": jurisdiction or "Global",
            "text": content,
            "summary": summary,
            "simpleSummary": simple_summary,
            "summaryPoints": summary_points,
            "riskScore": risk_score,
            "riskLevel": risk_label,
            "clauseTags": tags,
            "highlights": highlights,
            "timeline": timeline,
            "qa": qa,
            "facts": facts,
            "clauses": clauses,
            "graph": graph,
            "obligations": obligations,
            "ocrRecommended": ocr_recommended,
            "ocrConfidence": round(float(ocr_confidence), 2),
            "warnings": warnings,
            "analysisMode": "local-rag",
            "createdAt": _now_iso(),
        }
        self._persist_and_index(document_id, file_name, jurisdiction or "Global", content, extraction_method, ocr_recommended, ocr_confidence, result)
        return result

    def _answer_questions(self, text: str, risk_label: str, risk_score: int, tags: List[str]) -> Dict[str, str]:
        lowered = text.lower()
        penalty = "No explicit penalty clause was detected."
        if any(keyword in lowered for keyword in ["penalty", "liquidated damages", "fine"]):
            penalty = "A penalty-related clause appears in the document."
        exit_answer = "Early exit terms are not clearly stated."
        if any(keyword in lowered for keyword in ["terminate", "termination", "notice period"]):
            exit_answer = "There is a termination or notice clause, so early exit may be possible under the listed conditions."
        if risk_label == "High":
            risk_answer = f"Risks are high. Review {', '.join(tags[:3]) if tags else 'termination and liability'} carefully."
        elif risk_label == "Moderate":
            risk_answer = "Risks are moderate. Focus on notice, liability, and payment obligations."
        else:
            risk_answer = "Risks look lower, but the document still needs a full legal review before signing."
        return {
            "Is there a penalty?": penalty,
            "Can I leave early?": exit_answer,
            "What are my risks?": risk_answer,
        }

    def _simplify_text(self, text: str) -> str:
        replacements = {
            r"\bshall\b": "must",
            r"\bhereinafter\b": "from now on",
            r"\bpursuant to\b": "under",
            r"\bnotwithstanding\b": "even if",
            r"\bcommence\b": "start",
            r"\bterminate\b": "end",
            r"\bin the event that\b": "if",
            r"\bprior to\b": "before",
            r"\bprovided that\b": "if",
            r"\bindemnify\b": "cover losses",
        }
        simplified = text or ""
        for pattern, replacement in replacements.items():
            simplified = re.sub(pattern, replacement, simplified, flags=re.IGNORECASE)
        return _normalize_spaces(simplified)

    def simplify(self, text: str) -> Dict[str, Any]:
        return {"simpleText": self._simplify_text(text)}

    def retrieve(self, document_id: str, query: str, top_k: int = 5) -> Dict[str, Any]:
        matches = self.vector_index.search(document_id, query, top_k)
        return {
            "documentId": document_id,
            "query": query,
            "matches": [
                {
                    "chunkId": match["metadata"].get("chunk_id", f"{document_id}:{index}"),
                    "text": match["text"],
                    "metadata": match["metadata"],
                    "distance": match["distance"],
                }
                for index, match in enumerate(matches, start=1)
            ],
        }

    def chat(self, document_id: str, message: str, history: Optional[List[Dict[str, Any]]], jurisdiction: str = "Global") -> Dict[str, Any]:
        matches = self.vector_index.search(document_id, message, top_k=self.max_context_chunks)
        citations = []
        context_blocks = []
        for index, match in enumerate(matches, start=1):
            metadata = match["metadata"]
            citations.append({
                "clauseId": metadata.get("chunk_id", f"{document_id}:{index}"),
                "label": metadata.get("label", "Clause"),
                "lineStart": metadata.get("line_start", 0),
                "lineEnd": metadata.get("line_end", 0),
                "excerpt": match["text"][:260],
            })
            context_blocks.append(f"[{index}] {metadata.get('label', 'Clause')} (lines {metadata.get('line_start', 0)}-{metadata.get('line_end', 0)}): {match['text']}")

        answer = self._generate_answer(message, history or [], context_blocks, jurisdiction)
        self.storage.save_message(document_id, "user", message, citations=[])
        self.storage.save_message(document_id, "assistant", answer, citations=citations)
        return {
            "documentId": document_id,
            "answer": answer,
            "citations": citations,
            "history": self.storage.get_history(document_id),
            "streamingReady": True,
        }

    def _generate_answer(self, message: str, history: List[Dict[str, Any]], context_blocks: List[str], jurisdiction: str) -> str:
        if self._ollama_available():
            system_prompt, messages = self._build_ollama_prompt(message, history, context_blocks, jurisdiction)
            response = requests.post(
                f"{self.ollama_url.rstrip('/')}/api/chat",
                json={
                    "model": self.ollama_model,
                    "stream": False,
                    "messages": [{"role": "system", "content": system_prompt}, *messages],
                },
                timeout=120,
            )
            response.raise_for_status()
            body = response.json()
            message_body = body.get("message", {}).get("content") or body.get("response") or ""
            return _normalize_spaces(message_body)
        return self._fallback_chat_answer(message, context_blocks)

    def _build_ollama_prompt(self, message: str, history: List[Dict[str, Any]], context_blocks: List[str], jurisdiction: str):
        system_prompt = (
            "You are a local AI legal copilot. Answer only from the provided document context. "
            "If the answer is uncertain, say so. Use simple language and cite the most relevant clauses inline. "
            "When asked to summarize a clause, be concise. When asked whether something is risky, explain the risk plainly. "
            "When asked to rewrite a safer version, keep the clause legally cautious and practical. "
            f"Jurisdiction: {jurisdiction}."
        )
        messages = []
        for turn in history[-8:]:
            role = turn.get("role", "user")
            if role not in {"user", "assistant"}:
                continue
            messages.append({"role": role, "content": turn.get("content", "")})
        messages.append({
            "role": "user",
            "content": (
                f"Document context:\n{chr(10).join(context_blocks)}\n\n"
                f"User question: {message}\n"
                "Respond with direct legal analysis and include citations such as [Clause 1] or [Clause 2]."
            ),
        })
        return system_prompt, messages

    def _fallback_chat_answer(self, message: str, context_blocks: List[str]) -> str:
        lowered = message.lower()
        clauses = "\n".join(context_blocks[:3])
        if any(token in lowered for token in ["summarize", "summary"]):
            return f"Here is a short summary based on the most relevant clauses:\n\n{clauses}\n\nIn plain language, these clauses control the most important obligations and risks in the contract."
        if any(token in lowered for token in ["risky", "risk"]):
            return f"This appears risky because of the following clauses:\n\n{clauses}\n\nThe biggest concerns are usually termination rights, liability limits, indemnity, and payment penalties."
        if any(token in lowered for token in ["rewrite", "safer"]):
            return "A safer rewrite would reduce one-sided obligations, narrow indemnity, cap liability, add clear notice periods, and require mutual consent for any material change."
        if any(token in lowered for token in ["explain", "simple"]):
            return f"In simple language, the document says:\n\n{clauses}\n\nThat means you should review the highlighted obligations, dates, and money terms before signing."
        if not context_blocks:
            return "I could not retrieve enough relevant context from the document to answer confidently."
        return f"Based on the relevant clauses I found:\n\n{clauses}\n\nIf you want, I can also summarize this clause, explain whether it is risky, or suggest a safer rewrite."

    def _ollama_available(self) -> bool:
        try:
            response = requests.get(f"{self.ollama_url.rstrip('/')}/api/tags", timeout=5)
            return response.ok
        except Exception:
            return False

    def history(self, document_id: str) -> Dict[str, Any]:
        return {"documentId": document_id, "turns": self.storage.get_history(document_id)}

    def graph(self, document_id: str) -> Dict[str, Any]:
        document = self.storage.get_document(document_id)
        text = document["text_blob"] if document else ""
        chunks = self._build_chunks(document_id, text, document["file_name"] if document else "Document", document["jurisdiction"] if document else "Global")
        timeline = self._extract_timeline(text, self._extract_facts(text))
        graph = self._build_graph(chunks, timeline)
        return {
            "documentId": document_id,
            "nodes": graph["nodes"],
            "edges": graph["edges"],
            "warnings": ["Graph is generated locally from clause and timeline heuristics."],
        }

    def timeline(self, document_id: str) -> Dict[str, Any]:
        document = self.storage.get_document(document_id)
        text = document["text_blob"] if document else ""
        facts = self._extract_facts(text)
        events = self._extract_timeline(text, facts)
        obligations = self._build_obligations(events)
        urgent = len([event for event in events if event["urgency"] == "high"])
        upcoming = len(events)
        return {
            "documentId": document_id,
            "events": events,
            "obligations": obligations,
            "upcomingCount": upcoming,
            "urgentCount": urgent,
        }

    def compare_contracts(self, old_text: str, new_text: str, old_file_name: str = "Old Contract", new_file_name: str = "New Contract") -> Dict[str, Any]:
        old_lines = [line.strip() for line in (old_text or "").splitlines() if line.strip()]
        new_lines = [line.strip() for line in (new_text or "").splitlines() if line.strip()]
        diff = list(self._build_line_diff(old_lines, new_lines))
        old_clauses = self._build_clause_segments(old_text)
        new_clauses = self._build_clause_segments(new_text)
        matches, added, removed, modified = self._match_clauses(old_clauses, new_clauses)
        risk_delta = self._comparison_risk_delta(matches, added, removed, modified)
        labels = self._comparison_labels(risk_delta, modified)
        summary = self._comparison_summary(old_file_name, new_file_name, matches, added, removed, modified, risk_delta)
        return {
            "oldText": old_text,
            "newText": new_text,
            "oldFileName": old_file_name,
            "newFileName": new_file_name,
            "summary": summary,
            "lineDiff": diff,
            "matchedClauses": matches,
            "addedClauses": added,
            "removedClauses": removed,
            "modifiedClauses": modified,
            "riskDelta": risk_delta,
            "labels": labels,
            "riskIncreased": risk_delta > 0,
            "riskReduced": risk_delta < 0,
            "criticalChanges": [item for item in modified if item["riskLabel"] == "Critical Change"],
            "changeCount": len(added) + len(removed) + len(modified),
        }

    def _build_line_diff(self, old_lines: List[str], new_lines: List[str]):
        matcher = SequenceMatcher(None, old_lines, new_lines)
        for opcode, old_start, old_end, new_start, new_end in matcher.get_opcodes():
            yield {
                "type": opcode,
                "old": old_lines[old_start:old_end],
                "new": new_lines[new_start:new_end],
                "oldRange": [old_start + 1, old_end],
                "newRange": [new_start + 1, new_end],
            }

    def _build_clause_segments(self, text: str) -> List[Dict[str, Any]]:
        paragraphs = [segment.strip() for segment in re.split(r"\n\s*\n", text or "") if segment.strip()]
        segments = []
        for index, paragraph in enumerate(paragraphs, start=1):
            label, risk = self._classify_clause(paragraph)
            segments.append({
                "id": f"segment-{index}",
                "label": label,
                "text": paragraph,
                "risk": risk,
                "embedding": self.embedder.encode([paragraph], normalize_embeddings=True)[0],
            })
        return segments

    def _match_clauses(self, old_clauses: List[Dict[str, Any]], new_clauses: List[Dict[str, Any]]):
        matches = []
        added = []
        removed = []
        modified = []
        used_new = set()
        for old_clause in old_clauses:
            best_index = None
            best_score = 0.0
            for index, new_clause in enumerate(new_clauses):
                if index in used_new:
                    continue
                score = float(np.dot(old_clause["embedding"], new_clause["embedding"]))
                if score > best_score:
                    best_score = score
                    best_index = index
            if best_index is not None and best_score >= 0.68:
                used_new.add(best_index)
                new_clause = new_clauses[best_index]
                old_risk = self._risk_rank(old_clause["risk"])
                new_risk = self._risk_rank(new_clause["risk"])
                risk_change = new_risk - old_risk
                risk_label = "Risk Increased" if risk_change > 0 else "Risk Reduced" if risk_change < 0 else "Neutral Change"
                if risk_change >= 2 or old_clause["label"] != new_clause["label"]:
                    risk_label = "Critical Change"
                matches.append({
                    "old": old_clause,
                    "new": new_clause,
                    "similarity": round(best_score, 2),
                    "riskLabel": risk_label,
                })
                if best_score < 0.92 or old_clause["text"] != new_clause["text"]:
                    modified.append({
                        "old": old_clause,
                        "new": new_clause,
                        "similarity": round(best_score, 2),
                        "riskLabel": risk_label,
                        "explanation": self._explain_change(old_clause["text"], new_clause["text"], risk_label),
                    })
            else:
                removed.append(old_clause)
        for index, new_clause in enumerate(new_clauses):
            if index not in used_new:
                added.append(new_clause)
        return matches, added, removed, modified

    def _comparison_risk_delta(self, matches, added, removed, modified) -> int:
        delta = 0
        for item in modified:
            if item["riskLabel"] == "Risk Increased":
                delta += 2
            elif item["riskLabel"] == "Risk Reduced":
                delta -= 2
            elif item["riskLabel"] == "Critical Change":
                delta += 4
        delta += len([item for item in added if item.get("risk") == "High"]) * 2
        delta -= len([item for item in removed if item.get("risk") == "High"]) * 1
        return delta

    def _comparison_labels(self, risk_delta: int, modified: List[Dict[str, Any]]) -> List[str]:
        labels = []
        if risk_delta > 0:
            labels.append("Risk Increased")
        if risk_delta < 0:
            labels.append("Risk Reduced")
        if any(item["riskLabel"] == "Critical Change" for item in modified):
            labels.append("Critical Change")
        return labels or ["Neutral Change"]

    def _comparison_summary(self, old_file_name: str, new_file_name: str, matches, added, removed, modified, risk_delta: int) -> str:
        sections = [
            f"Compared {old_file_name} against {new_file_name}.",
            f"Matched clauses: {len(matches)}.",
            f"Added clauses: {len(added)}.",
            f"Removed clauses: {len(removed)}.",
            f"Modified clauses: {len(modified)}.",
        ]
        if risk_delta > 0:
            sections.append("Overall risk increased because the new version introduced stricter or broader obligations.")
        elif risk_delta < 0:
            sections.append("Overall risk reduced because the new version softened or removed some risky language.")
        else:
            sections.append("Overall risk stayed broadly similar.")
        return " ".join(sections)

    def _risk_rank(self, label: str) -> int:
        return {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}.get(label, 1)

    def _explain_change(self, old_text: str, new_text: str, risk_label: str) -> str:
        if risk_label == "Critical Change":
            return "The clause changed materially and may alter core legal exposure."
        if risk_label == "Risk Increased":
            return "The new clause is more aggressive or less protective than before."
        if risk_label == "Risk Reduced":
            return "The updated clause removes or softens some of the earlier risk."
        if old_text == new_text:
            return "The clause is effectively unchanged."
        return "The clause was edited but the overall legal position appears similar."

    def _ocr_fallback(self, file_bytes: bytes) -> Tuple[str, List[str], float]:
        warnings: List[str] = []
        extracted_text = ""
        confidence = 0.0
        if fitz is not None:
            try:
                doc = fitz.open(stream=file_bytes, filetype="pdf")
                for page_index, page in enumerate(doc, start=1):
                    text = page.get_text("text") or ""
                    warnings.append(f"Page {page_index}: extracted {len(text.split())} words from PDF text layer")
                    if len(text.strip()) < 40 and pytesseract is not None and Image is not None:
                        pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                        image = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                        image = ImageOps.grayscale(image)
                        image = image.filter(ImageFilter.SHARPEN)
                        ocr_text = pytesseract.image_to_string(image)
                        text += "\n" + ocr_text
                    extracted_text += text + "\n"
            except Exception as exc:
                warnings.append(f"PyMuPDF fallback failed: {exc}")
        if not extracted_text and pdfplumber is not None:
            try:
                with pdfplumber.open(io.BytesIO(file_bytes)) as pdf:
                    for page_index, page in enumerate(pdf.pages, start=1):
                        page_text = page.extract_text() or ""
                        extracted_text += page_text + "\n"
                        warnings.append(f"Page {page_index}: pdfplumber extracted {len(page_text.split())} words")
            except Exception as exc:
                warnings.append(f"pdfplumber fallback failed: {exc}")
        if extracted_text.strip():
            confidence = min(0.96, max(0.2, len(extracted_text.split()) / 1200.0))
        elif pytesseract is not None:
            warnings.append("Tesseract OCR was not able to extract enough visible text.")
        return extracted_text.strip(), warnings, confidence

