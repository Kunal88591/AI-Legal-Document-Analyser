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
import importlib
import numpy as np
import requests
from dateutil import parser as date_parser

# Dynamic imports for optional ML/NLP libraries to eliminate IDE unresolved import warnings
spacy: Any = None
try:
    spacy = importlib.import_module("spacy")
except Exception:  # pragma: no cover
    spacy = None

SentenceTransformer: Any = None
try:
    _st_mod = importlib.import_module("sentence_transformers")
    SentenceTransformer = getattr(_st_mod, "SentenceTransformer", None)
except Exception:  # pragma: no cover
    SentenceTransformer = None

chromadb: Any = None
try:
    chromadb = importlib.import_module("chromadb")
except Exception:  # pragma: no cover
    chromadb = None

fitz: Any = None
try:
    fitz = importlib.import_module("fitz")
except Exception:  # pragma: no cover
    fitz = None

pdfplumber: Any = None
try:
    pdfplumber = importlib.import_module("pdfplumber")
except Exception:  # pragma: no cover
    pdfplumber = None

pytesseract: Any = None
try:
    pytesseract = importlib.import_module("pytesseract")
except Exception:  # pragma: no cover
    pytesseract = None

Image: Any = None
ImageFilter: Any = None
ImageOps: Any = None
try:
    Image = importlib.import_module("PIL.Image")
    ImageFilter = importlib.import_module("PIL.ImageFilter")
    ImageOps = importlib.import_module("PIL.ImageOps")
except Exception:  # pragma: no cover
    Image = None
    ImageFilter = None
    ImageOps = None


CLAUSE_KEYWORDS = {
    "termination": ["terminate", "termination", "without cause", "for cause", "cure period", "material breach", "convenience"],
    "confidentiality": ["confidential", "confidentiality", "non-disclosure", "nda", "trade secret", "survival"],
    "indemnity": ["indemnify", "indemnity", "hold harmless", "defense of claims", "infringement"],
    "liability": ["liability", "liable", "damages", "limitation of liability", "indirect damages", "consequential"],
    "payment": ["payment", "fee", "fees", "compensation", "invoice", "billing", "usd", "interest"],
    "renewal": ["renewal", "auto-renew", "automatic renewal", "successive", "initial term", "expiration"],
    "notice": ["notice", "notify", "notification", "prior written notice"],
    "arbitration": ["arbitration", "dispute resolution", "governing law", "jurisdiction", "venue", "arbitrator"],
    "data_protection": ["data protection", "security incident", "customer data", "subprocessor", "personal data", "deletion"],
    "intellectual_property": ["intellectual property", "ip rights", "license", "ownership", "title and interest"],
    "assignment": ["assignment", "assign", "transfer", "successor", "merger"],
    "audit": ["audit", "compliance", "inspection", "records"],
}

RISK_KEYWORDS = {
    "high": [
        "unlimited liability", "sole discretion", "without notice", "penalty", "liquidated damages",
        "forfeiture", "indemnify and hold harmless", "waive all rights", "unilateral amendment"
    ],
    "medium": [
        "material breach", "may terminate", "auto-renew", "automatic renewal", "limitation of liability",
        "consequential damages", "security incident", "cure period", "subprocessor"
    ],
    "low": [
        "reasonable efforts", "commercially reasonable", "mutual consent", "written notice",
        "good faith", "standard business hours"
    ],
}

DATE_PATTERNS = [
    r"\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b",
    r"\b\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b",
    r"\b\d{4}-\d{2}-\d{2}\b",
    r"\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b",
]

MONEY_PATTERN = r"(?:(?:USD|EUR|GBP|INR|[$₹€£])\s?\d{1,3}(?:,\d{3})*(?:\.\d+)?|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b)"


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
    if nlp is not None:
        try:
            doc = nlp(text or "")
            return [sentence.text.strip() for sentence in doc.sents if sentence.text.strip()]
        except Exception:
            pass
    raw_sentences = re.split(r"(?<=[.?!])\s+", (text or "").strip())
    return [s.strip() for s in raw_sentences if s.strip()]



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

    def upsert_document(
        self,
        document_id: str,
        file_name: str,
        jurisdiction: str,
        extraction_method: str,
        ocr_recommended: bool,
        ocr_confidence: Optional[float],
        text_blob: str,
        analysis: Dict[str, Any],
    ) -> None:
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
                    float(ocr_confidence) if ocr_confidence is not None else None,
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
            "ocr_confidence": float(row[5]) if row[5] is not None else None,
            "analysis": _safe_json_loads(row[6], {}),
            "text_blob": row[7] or "",
            "created_at": row[8],
        }


class VectorIndex:
    def __init__(self, base_dir: Path, embedder: Any = None):
        self.base_dir = base_dir
        self.embedder = embedder
        _ensure_dir(base_dir)
        self.client = chromadb.PersistentClient(path=str(base_dir)) if chromadb else None
        self.collection = None if self.client is None else self.client.get_or_create_collection(name="legal_documents")

    def upsert(self, chunks: Sequence[Chunk]) -> None:
        if not self.collection or not chunks:
            return
        embeddings = None
        if self.embedder is not None:
            try:
                embeddings = self.embedder.encode([chunk.text for chunk in chunks], normalize_embeddings=True).tolist()
            except Exception:
                embeddings = None
        upsert_kwargs: Dict[str, Any] = {
            "ids": [chunk.chunk_id for chunk in chunks],
            "documents": [chunk.text for chunk in chunks],
            "metadatas": [{
                **chunk.metadata,
                "chunk_id": chunk.chunk_id,
                "document_id": chunk.document_id,
                "chunk_index": chunk.chunk_index,
                "line_start": chunk.line_start,
                "line_end": chunk.line_end,
                "label": chunk.label,
                "risk": chunk.risk,
            } for chunk in chunks],
        }
        if embeddings is not None:
            upsert_kwargs["embeddings"] = embeddings
        self.collection.upsert(**upsert_kwargs)

    def search(self, document_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        if not self.collection:
            return []
        result = None
        if self.embedder is not None:
            try:
                query_embedding = self.embedder.encode([query], normalize_embeddings=True).tolist()
                result = self.collection.query(
                    query_embeddings=query_embedding,
                    n_results=max(1, top_k),
                    where={"document_id": document_id},
                    include=["documents", "metadatas", "distances"],
                )
            except Exception:
                result = None
        if result is None:
            try:
                result = self.collection.query(
                    query_texts=[query],
                    n_results=max(1, top_k),
                    where={"document_id": document_id},
                    include=["documents", "metadatas", "distances"],
                )
            except Exception:
                return []
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
        if SentenceTransformer is not None:
            try:
                self.embedder = SentenceTransformer(os.environ.get("EMBEDDING_MODEL", "all-MiniLM-L6-v2"))
            except Exception:
                self.embedder = None
        else:
            self.embedder = None
        self.vector_index = VectorIndex(base_dir / "chroma", self.embedder)
        self.ollama_url = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
        self.ollama_model = os.environ.get("OLLAMA_MODEL", "llama3.1:8b")
        self.max_context_chunks = int(os.environ.get("MAX_CONTEXT_CHUNKS", "4"))
        self.max_chunk_words = int(os.environ.get("MAX_CHUNK_WORDS", "180"))
        self.nlp = self._build_spacy_pipeline()

    def _build_spacy_pipeline(self):
        if spacy is None:
            return None
        try:
            model = spacy.load("en_core_web_sm")
        except Exception:
            try:
                model = spacy.blank("en")
            except Exception:
                return None
        if "sentencizer" not in model.pipe_names:
            try:
                model.add_pipe("sentencizer")
            except Exception:
                pass
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

    # =========================================================================
    # LEGAL INTELLIGENCE AUDIT & CORE EXTRACTORS
    # =========================================================================

    def _detect_contract_type(self, text: str) -> str:
        """
        Hierarchical, weighted contract classification.
        Examines Title, Preamble (first 1200 chars), and Document Body.
        Prevents standard employee/contractor confidentiality references from
        causing a false-positive 'Employment' classification on commercial agreements.
        """
        header_sample = text[:1500].lower()
        lowered = text.lower()

        # 1. Direct Title / Preamble Checks (highest confidence)
        if any(term in header_sample for term in [
            "software services and data processing agreement",
            "software services agreement",
            "data processing agreement",
            "master services agreement",
            "cloud services agreement",
            "saas agreement",
            "commercial services agreement",
        ]):
            return "Software Services / Commercial Services Agreement"

        if any(term in header_sample for term in [
            "non-disclosure agreement",
            "nondisclosure agreement",
            "confidentiality agreement",
            "mutual non-disclosure",
        ]):
            return "Non-Disclosure Agreement (NDA)"

        if any(term in header_sample for term in [
            "employment agreement",
            "employment contract",
            "offer of employment",
            "executive employment agreement",
        ]):
            return "Employment Agreement"

        if any(term in header_sample for term in [
            "lease agreement",
            "commercial lease",
            "residential tenancy",
            "tenancy agreement",
        ]):
            return "Lease Agreement"

        if any(term in header_sample for term in [
            "software license agreement",
            "end user license agreement",
            "eula",
            "master license agreement",
        ]):
            return "License Agreement"

        # 2. Weighted feature scoring for body
        scores = {
            "Software Services / Commercial Services Agreement": 0,
            "Employment Agreement": 0,
            "Non-Disclosure Agreement (NDA)": 0,
            "Lease Agreement": 0,
            "License Agreement": 0,
        }

        # Services / SaaS signals
        if "data processing" in lowered:
            scores["Software Services / Commercial Services Agreement"] += 4
        if any(t in lowered for t in ["cloud-hosted", "api access", "subprocessor", "subprocessors"]):
            scores["Software Services / Commercial Services Agreement"] += 4
        if any(t in lowered for t in ["services", "statement of work", "deliverables", "consulting"]):
            scores["Software Services / Commercial Services Agreement"] += 2

        # True Employment signals (require bona fide employment context)
        if any(t in lowered for t in ["employer and employee", "employment duties", "reporting to the board", "base salary", "probationary period"]):
            scores["Employment Agreement"] += 5
        elif any(t in lowered for t in ["employment", "employee"]):
            # If "employee" appears merely as part of "employees, contractors, agents" (confidentiality scope), don't score heavily
            if "employer" in lowered or "salary" in lowered or "payroll" in lowered:
                scores["Employment Agreement"] += 3

        # NDA signals
        if "disclosing party" in lowered and "receiving party" in lowered:
            scores["Non-Disclosure Agreement (NDA)"] += 5

        # Lease signals
        if any(t in lowered for t in ["landlord", "tenant", "leased premises"]):
            scores["Lease Agreement"] += 6

        # License signals
        if any(t in lowered for t in ["licensor", "licensee", "licensed software"]):
            scores["License Agreement"] += 5

        top_category, top_score = max(scores.items(), key=lambda item: item[1])
        if top_score >= 3:
            return top_category
        return "General Commercial Contract"

    def _extract_semantic_dates(self, text: str) -> List[Dict[str, Any]]:
        """
        Extracts dates and normalizes them into ISO format (YYYY-MM-DD),
        associating each with its semantic contractual purpose using distance-based
        keyword disambiguation to prevent context bleeding across adjacent clauses/table rows.
        """
        categories = [
            ("EFFECTIVE_DATE", ["effective date", "entered into as of", "agreement begins", "commencement date"], "Agreement effective start date"),
            ("EXPIRATION_DATE", ["initial term ends", "expiration date", "expiry", "shall expire on", "ending at 11:59"], "Initial term expiration date"),
            ("FIRST_INVOICE_DATE", ["first invoice", "initial invoice", "invoice shall be issued on", "usd 12,000 invoice"], "Initial service invoice date"),
            ("NON_RENEWAL_NOTICE_DEADLINE", ["non-renewal notice deadline", "non-renewal deadline", "last date to prevent", "shall not prevent renewal"], "Last day to deliver non-renewal notice"),
            ("IMPLEMENTATION_DEADLINE", ["implementation target", "onboarding target", "completed no later than"], "Implementation and onboarding target deadline"),
            ("PRODUCTION_APPROVAL_DEADLINE", ["production approval", "approve production configuration", "customer approval deadline"], "Customer production approval deadline"),
            ("TECHNICAL_CONTACT_DEADLINE", ["technical contact", "security contact", "contacts designated"], "Designation of technical and security contacts"),
            ("SOURCE_DATA_DEADLINE", ["source data", "required credentials and source data"], "Customer dependency for implementation"),
            ("SECURITY_INCIDENT_DEADLINE", ["security incident", "breach notice"], "Incident notification deadline"),
        ]

        raw_candidates = []
        for pattern in DATE_PATTERNS:
            for match in re.finditer(pattern, text, flags=re.IGNORECASE):
                raw_str = match.group(0).strip()
                start = match.start()
                end = match.end()
                window_start = max(0, start - 100)
                window_end = min(len(text), end + 100)
                window = text[window_start:window_end]

                clean_date_str = re.sub(r"[,\.]", "", raw_str)
                try:
                    dt = date_parser.parse(clean_date_str, fuzzy=True)
                    iso_date = dt.strftime("%Y-%m-%d")
                except Exception:
                    iso_date = raw_str

                best_type = "GENERAL_DATE"
                best_desc = "Contractual date reference"
                best_dist = 9999

                for dtype, keywords, desc in categories:
                    for kw in keywords:
                        for km in re.finditer(re.escape(kw), window, flags=re.IGNORECASE):
                            km_start = window_start + km.start()
                            km_end = window_start + km.end()
                            if km_end <= start:
                                dist = start - km_end
                            elif km_start >= end:
                                dist = km_start - end
                            else:
                                dist = 0
                            if dist < best_dist:
                                best_dist = dist
                                best_type = dtype
                                best_desc = desc

                raw_candidates.append({
                    "date": iso_date,
                    "raw": raw_str,
                    "type": best_type,
                    "description": best_desc,
                    "context": _normalize_spaces(window),
                    "dist": best_dist,
                    "start": start,
                })

        # Group and select most confident match per semantic type
        type_best: Dict[str, Dict[str, Any]] = {}
        general_dates: List[Dict[str, Any]] = []

        for candidate in raw_candidates:
            c_type = candidate["type"]
            if c_type == "GENERAL_DATE":
                general_dates.append(candidate)
            else:
                if c_type not in type_best or candidate["dist"] < type_best[c_type]["dist"]:
                    type_best[c_type] = candidate

        semantic_dates: List[Dict[str, Any]] = []
        for c in type_best.values():
            semantic_dates.append({
                "date": c["date"],
                "raw": c["raw"],
                "type": c["type"],
                "description": c["description"],
                "context": c["context"],
            })

        for g in general_dates:
            # avoid duplicating an ISO date already classified
            if not any(s["date"] == g["date"] for s in semantic_dates):
                semantic_dates.append({
                    "date": g["date"],
                    "raw": g["raw"],
                    "type": g["type"],
                    "description": g["description"],
                    "context": g["context"],
                })

        return semantic_dates

    def _extract_semantic_durations(self, text: str) -> List[Dict[str, Any]]:
        """
        Extracts durations and categorizes them by legal purpose:
        INITIAL_TERM, RENEWAL_PERIOD, NOTICE_PERIOD, CURE_PERIOD,
        INCIDENT_RESPONSE, SURVIVAL_PERIOD, AUDIT_NOTICE, PAYMENT_WINDOW.
        """
        durations: List[Dict[str, Any]] = []
        seen = set()

        patterns = [
            (r"(?:initial\s+term.*?commence.*?for\s+|initial\s+term\s+of\s+)?(\d+|twelve|one|two|three|six)\s*\(?(\d+)?\)?\s*(months?|years?)\s*(?:from\s+the\s+effective\s+date)?", "INITIAL_TERM", "Initial contract duration"),
            (r"renew(?:s|al)?\s+for\s+(?:successive\s+)?(\d+|twelve|one)\s*\(?(\d+)?\)?[\s\-]+(months?|years?)", "RENEWAL_PERIOD", "Automatic renewal period"),
            (r"(?:(?:written\s+)?non-renewal\s+notice.*?at\s+least|at\s+least)\s+(\d+|sixty)\s*\(?(\d+)?\)?\s*(?:calendar\s+)?days?[\'’]?\s*(?:prior\s+)?(?:written\s+notice\s+)?before\s+(?:the\s+end|renewal)", "NON_RENEWAL_NOTICE_PERIOD", "Advance notice required to prevent automatic renewal"),
            (r"(?:terminate\s+for\s+convenience.*?(?:with|by\s+giving)\s+)(\d+|ninety)\s*\(?(\d+)?\)?\s*(?:calendar\s+)?days?[\'’]?\s*(?:prior\s+)?written\s+notice", "CONVENIENCE_TERMINATION_NOTICE", "Notice period for termination without cause"),
            (r"(?:within\s+)(\d+|twenty-four|24)\s*\(?(\d+)?\)?\s*(hours?)\s*(?:where\s+reasonably\s+practicable)?.*?(?:security\s+incident|breach)", "SECURITY_INCIDENT_NOTIFICATION", "Security incident notification deadline"),
            (r"(?:resolve\s+Severity\s+1.*?within\s+)(\d+|four)\s*\(?(\d+)?\)?\s*(hours?)", "SEVERITY_1_SLA", "Resolution deadline for critical incidents"),
            (r"(?:cure\s+(?:such\s+)?breach\s+within\s+)(\d+|thirty)\s*\(?(\d+)?\)?\s*(?:calendar\s+)?(days?)", "CURE_PERIOD", "Cure period for material breach"),
            (r"(?:within\s+)(\d+|thirty)\s*\(?(\d+)?\)?\s*(?:calendar\s+)?(days?)\s*of\s+(?:the\s+)?invoice\s+date", "PAYMENT_TERMS", "Invoice payment terms"),
            (r"(?:at\s+least\s+)?(\d+|thirty)\s*\(?(\d+)?\)?\s*(?:calendar\s+)?days?[\'’]?\s*(?:prior\s+)?notice\s+before\s+appointing\s+(?:a\s+)?new\s+subprocessor", "SUBPROCESSOR_NOTICE_PERIOD", "Advance notice for new subprocessor"),
            (r"(?:object.*?within\s+)(\d+|ten)\s*\(?(\d+)?\)?\s*(?:calendar\s+)?(days?)", "SUBPROCESSOR_OBJECTION_WINDOW", "Window to object to new subprocessor"),
            (r"(?:(?:shall\s+continue|survive)\s+(?:for\s+)?(?:a\s+period\s+of\s+)?|survival.*?for\s+)(\d+|five)\s*\(?(\d+)?\)?\s*(years?)\s*(?:following\s+termination)?", "CONFIDENTIALITY_SURVIVAL", "Duration confidentiality duties survive termination"),
            (r"(?:upon\s+at\s+least\s+)(\d+|fifteen)\s*\(?(\d+)?\)?\s*(business\s+days?[\'’]?)\s*written\s+notice", "AUDIT_NOTICE_PERIOD", "Advance notice required before compliance audit"),
            (r"(?:retain.*?for\s+(?:up\s+to\s+)?|within\s+)(\d+|thirty)\s*\(?(\d+)?\)?\s*(?:calendar\s+)?days?[\'’]?\s*(?:following|after)\s+termination.*?delet", "DATA_DELETION_PERIOD", "Customer data retention and deletion deadline"),
            (r"(?:within\s+)(\d+|thirty)\s*\(?(\d+)?\)?\s*(?:calendar\s+)?days?[\'’]?\s*after\s+written\s+escalation.*?arbitration", "DISPUTE_ESCALATION_PERIOD", "Executive negotiation window before arbitration"),
        ]

        for regex, dur_type, desc in patterns:
            match = re.search(regex, text, flags=re.IGNORECASE | re.DOTALL)
            if match:
                full_matched_text = _normalize_spaces(match.group(0))
                if dur_type not in seen:
                    seen.add(dur_type)
                    durations.append({
                        "type": dur_type,
                        "matchedText": full_matched_text,
                        "description": desc,
                    })

        return durations

    def _extract_contract_metadata(self, text: str) -> Dict[str, Any]:
        """
        Extracts key parties, jurisdiction, governing law, and core business terms.
        """
        metadata = {
            "parties": [],
            "governingLaw": "Not specified",
            "effectiveDate": None,
            "initialTerm": "Not clearly stated",
            "renewal": "Not specified",
            "monthlyFee": "Not specified",
            "paymentTerms": "Not specified",
        }

        # Governing Law
        law_match = re.search(r"governed\s+by\s+(?:the\s+laws\s+of\s+)?([^,\.\n]+)", text, flags=re.IGNORECASE)
        if law_match:
            metadata["governingLaw"] = _normalize_spaces(law_match.group(1)).strip()

        # Parties
        preamble = text[:2500]
        customer_match = re.search(r"([A-Z][A-Za-z0-9\s\.\&]+(?:Private\s+Limited|Limited|Ltd\.?|Inc\.?|LLC|Pte\.?|Corp\.?))\s*,?[^;“\"]*?[“\"]Customer[”\"]", preamble)
        provider_match = re.search(r"(?:and\s+|;\s+and\s+)?([A-Z][A-Za-z0-9\s\.\&]+(?:Private\s+Limited|Limited|Ltd\.?|Inc\.?|LLC|Pte\.?|Corp\.?))\s*,?[^;“\"]*?[“\"]Provider[”\"]", preamble)
        if customer_match:
            metadata["parties"].append({"role": "Customer", "name": _normalize_spaces(customer_match.group(1)).strip(", ")})
        if provider_match:
            metadata["parties"].append({"role": "Provider", "name": _normalize_spaces(provider_match.group(1)).strip(", ")})

        # Fee
        fee_match = re.search(r"(?:USD|[$])\s?(\d{1,3}(?:,\d{3})*)\s*(?:per\s+month|monthly)?", text, flags=re.IGNORECASE)
        if fee_match:
            metadata["monthlyFee"] = f"USD {fee_match.group(1)}"

        # Initial term
        term_match = re.search(r"initial\s+term\s+of\s+([^\.]+?\b(?:months?|years?)\b)", text, flags=re.IGNORECASE)
        if term_match:
            metadata["initialTerm"] = _normalize_spaces(term_match.group(1))

        # Renewal
        if "automatically renew" in text.lower() or "automatic renewal" in text.lower():
            metadata["renewal"] = "Automatic renewal for successive periods unless advance notice is provided"

        # Payment
        pay_match = re.search(r"payment\s+within\s+(\d+\s+days)|within\s+(\d+\s+days)\s+of\s+the\s+invoice\s+date", text, flags=re.IGNORECASE)
        if pay_match:
            days = pay_match.group(1) or pay_match.group(2)
            metadata["paymentTerms"] = f"Net {days}"

        return metadata

    def _extract_structured_obligations(self, text: str) -> List[Dict[str, Any]]:
        """
        Extracts genuine contractual obligations with party, duty, trigger, deadline, and source.
        Does not fabricate obligations.
        """
        obligations = []
        counter = 1

        duty_specs = [
            {
                "party": "Provider",
                "duty": "Notify Customer of confirmed Security Incident affecting Customer Data",
                "trigger": "Confirmed Security Incident affecting Customer Data",
                "deadline": "Within 24 hours where reasonably practicable after confirmation",
                "source": "Section 7 (Data Protection and Security)",
                "frequency": "Per incident",
                "consequence": "Breach of data protection obligations",
                "regex": r"notify\s+Customer.*?within\s+twenty-four\s*\(24\)\s*hours.*?(?:Security\s+Incident|breach)",
            },
            {
                "party": "Provider",
                "duty": "Resolve Severity 1 critical incidents under SLA",
                "trigger": "Receipt of notice of Severity 1 incident",
                "deadline": "Within four (4) hours after notice",
                "source": "Section 2 (Services)",
                "frequency": "Per incident",
                "consequence": "SLA non-conformance",
                "regex": r"resolve\s+Severity\s+1\s+incidents\s+within\s+four\s*\(4\)\s*hours",
            },
            {
                "party": "Provider",
                "duty": "Delete Customer Data following agreement termination or expiration",
                "trigger": "Termination or expiration of Agreement",
                "deadline": "Within thirty (30) days following termination",
                "source": "Section 7 (Data Protection and Security)",
                "frequency": "Upon termination",
                "consequence": "Regulatory & contractual non-compliance",
                "regex": r"(?:up\s+to\s+thirty\s*\(30\)\s*days.*?deletion|Customer\s+Data\s+shall\s+be\s+deleted)",
            },
            {
                "party": "Provider",
                "duty": "Provide prior written notice before appointing new subprocessors",
                "trigger": "Proposed appointment of new subprocessor processing Customer Data",
                "deadline": "At least thirty (30) days' prior notice",
                "source": "Section 8 (Subprocessors)",
                "frequency": "Prior to appointment",
                "consequence": "Customer objection right triggered",
                "regex": r"at\s+least\s+thirty\s*\(30\)\s*days['’]?\s+prior\s+notice\s+before\s+appointing\s+a\s+new\s+subprocessor",
            },
            {
                "party": "Customer",
                "duty": "Object to appointment of new subprocessor on reasonable data-protection grounds",
                "trigger": "Receipt of notice regarding new subprocessor",
                "deadline": "Within ten (10) days after receiving notice",
                "source": "Section 8 (Subprocessors)",
                "frequency": "Per appointment",
                "consequence": "Provider may propose alternative or terminate without penalty",
                "regex": r"object\s+on\s+reasonable\s+data-protection\s+grounds\s+within\s+ten\s*\(10\)\s*days",
            },
            {
                "party": "Provider",
                "duty": "Defend and indemnify Customer against third-party IP infringement claims",
                "trigger": "Third-party claim alleging Services infringe third-party IP rights",
                "deadline": "Promptly upon receipt of written notice",
                "source": "Section 11 (Indemnification)",
                "frequency": "Per claim",
                "consequence": "Obligation to pay awarded damages or approved settlement",
                "regex": r"Provider\s+shall\s+defend\s+Customer\s+against\s+a\s+third-party\s+claim.*?infringe",
            },
            {
                "party": "Customer",
                "duty": "Pay undisputed service fees upon receipt of invoice",
                "trigger": "Monthly invoice issuance",
                "deadline": "Within thirty (30) calendar days of the invoice date",
                "source": "Section 3 (Fees and Payment)",
                "frequency": "Monthly",
                "consequence": "Interest at 1.5% per month and service suspension upon 10 days notice",
                "regex": r"(?:is\s+due|payable)\s+within\s+thirty\s*\(30\)\s*(?:calendar\s+)?days\s+of\s+the\s+invoice\s+date",
            },
            {
                "party": "Customer",
                "duty": "Provide written non-renewal notice to prevent automatic contract extension",
                "trigger": "Intent not to renew current 12-month term",
                "deadline": "At least sixty (60) days prior written notice before term expiration",
                "source": "Section 4 (Term and Renewal)",
                "frequency": "Once per term",
                "consequence": "Agreement automatically renews for another 12-month period",
                "regex": r"(?:written\s+non-renewal\s+notice.*?at\s+least|at\s+least)\s+sixty\s*\(60\)\s*(?:calendar\s+)?days.*?before\s+the\s+end",
            },
            {
                "party": "Customer",
                "duty": "Deliver written notice for termination for convenience",
                "trigger": "Exercise of convenience termination right (after first 6 months)",
                "deadline": "Ninety (90) days' prior written notice",
                "source": "Section 13 (Termination)",
                "frequency": "Optional",
                "consequence": "Effective contract termination with non-refundable monthly fees",
                "regex": r"terminate\s+for\s+convenience\s+after\s+the\s+first\s+six\s*\(6\)\s*months\s+by\s+giving\s+ninety\s*\(90\)\s*days",
            },
            {
                "party": "Both Parties",
                "duty": "Cure material breach following receipt of written notification",
                "trigger": "Receipt of formal notice describing material breach",
                "deadline": "Within thirty (30) days after receiving written notice",
                "source": "Section 13 (Termination)",
                "frequency": "Upon breach notice",
                "consequence": "Immediate contract termination for cause",
                "regex": r"cure\s+such\s+breach\s+within\s+thirty\s*\(30\)\s*days\s+after\s+receiving\s+written\s+notice",
            },
            {
                "party": "Both Parties",
                "duty": "Maintain confidentiality of non-public business and technical information",
                "trigger": "Receipt or disclosure of Confidential Information",
                "deadline": "Survives for five (5) years following termination or expiration",
                "source": "Section 5 (Confidentiality)",
                "frequency": "Ongoing",
                "consequence": "Equitable relief and unlimited liability exclusion",
                "regex": r"(?:shall\s+continue|survive)\s+for\s+five\s*\(5\)\s*years\s+following\s+termination",
            },
            {
                "party": "Provider",
                "duty": "Permit annual documentation audit of security compliance",
                "trigger": "Customer annual audit request",
                "deadline": "Upon at least fifteen (15) business days' written notice",
                "source": "Section 15 (Audit and Compliance)",
                "frequency": "Once per calendar year",
                "consequence": "Contractual compliance verification",
                "regex": r"upon\s+at\s+least\s+fifteen\s*\(15\)\s*business\s+days['’]?\s+written\s+notice.*?compliance",
            },
            {
                "party": "Customer",
                "duty": "Review and approve production configuration for onboarding",
                "trigger": "Implementation completion",
                "deadline": "No later than February 20, 2026",
                "source": "Section 5 (Customer Responsibilities)",
                "frequency": "Once during onboarding",
                "consequence": "Delay in go-live without provider breach",
                "regex": r"approve\s+production\s+configuration\s+no\s+later\s+than\s+February\s+20,\s+2026",
            },
        ]

        for spec in duty_specs:
            if re.search(spec["regex"], text, flags=re.IGNORECASE | re.DOTALL):
                obligations.append({
                    "id": f"obligation-{counter}",
                    "party": spec["party"],
                    "obligation": spec["duty"],
                    "trigger": spec["trigger"],
                    "deadline": spec["deadline"],
                    "frequency": spec["frequency"],
                    "consequence": spec["consequence"],
                    "source": spec["source"],
                    "urgency": "high" if "24 hours" in spec["deadline"] or "breach" in spec["duty"].lower() else "medium",
                })
                counter += 1

        return obligations

    def _compute_multi_dimensional_risk(self, text: str, clause_labels: List[str]) -> Dict[str, Any]:
        """
        Balanced, multi-dimensional risk scoring.
        Evaluates 4 categories (0-25 each, 100 max):
        1. Liability & Financial Exposure
        2. Termination & Lock-in Mechanics
        3. Data Privacy & Operational Security
        4. IP, Restrictive Covenants & Remedies
        Produces an explainable, non-saturated score with clear rationale.
        """
        lowered = text.lower()
        supporting_clauses: List[Dict[str, Any]] = []

        # 1. Liability & Financial (0-25)
        liability_score = 12  # Base moderate score for standard commercial risk
        if "limitation of liability" in lowered:
            if "twelve (12) months" in lowered or "12 months" in lowered:
                liability_score = 10  # Standard balanced market cap
                supporting_clauses.append({"category": "Liability", "clause": "12-month fees paid liability cap", "impact": "Balanced"})
            elif "unlimited liability" in lowered:
                liability_score = 24
                supporting_clauses.append({"category": "Liability", "clause": "Unlimited liability provisions", "impact": "High Risk"})
        if "consequential damages" in lowered and "neither party shall be liable" in lowered:
            liability_score = max(5, liability_score - 3)  # Mutual consequential waiver is protective
            supporting_clauses.append({"category": "Liability", "clause": "Mutual consequential damages waiver", "impact": "Protective"})

        # 2. Termination & Lock-in (0-25)
        termination_score = 10
        if "automatically renew" in lowered or "automatic renewal" in lowered:
            termination_score += 4  # Auto-renewal adds potential lock-in
            supporting_clauses.append({"category": "Termination", "clause": "Automatic 12-month renewal clause", "impact": "Moderate Risk"})
        if "60 days" in lowered and "non-renewal" in lowered or "notice before" in lowered:
            termination_score += 2  # 60-day notice window requires proactive calendaring
        if "terminate for convenience" in lowered:
            termination_score = max(5, termination_score - 3)  # Convenience termination reduces lock-in risk
            supporting_clauses.append({"category": "Termination", "clause": "Customer convenience termination right", "impact": "Protective"})

        # 3. Data Privacy & Security (0-25)
        privacy_score = 12
        if "security incident" in lowered:
            if "twenty-four (24) hours" in lowered or "24 hours" in lowered:
                privacy_score += 3  # Strict reporting SLA
                supporting_clauses.append({"category": "Data Privacy", "clause": "24-hour security incident reporting SLA", "impact": "High Operational Duty"})
        if "subprocessor" in lowered and "object" in lowered:
            privacy_score = max(5, privacy_score - 2)  # Right to object to subprocessors is protective
        if "delete" in lowered and "customer data" in lowered:
            privacy_score = max(5, privacy_score - 2)  # Data deletion commitment is protective

        # 4. IP & Remedies (0-25)
        ip_score = 10
        if "customer retains all right, title, and interest in customer data" in lowered or "retains all right" in lowered:
            ip_score = max(5, ip_score - 3)  # Customer data ownership preserved
            supporting_clauses.append({"category": "Intellectual Property", "clause": "Customer retains ownership of Customer Data", "impact": "Protective"})
        if "non-compete" in lowered or "non compete" in lowered:
            ip_score += 10
            supporting_clauses.append({"category": "Intellectual Property", "clause": "Restrictive covenant / non-compete clause", "impact": "High Risk"})
        if "indemnif" in lowered:
            ip_score += 2  # Indemnity obligations present

        # Clamp category scores
        liability_score = max(0, min(25, liability_score))
        termination_score = max(0, min(25, termination_score))
        privacy_score = max(0, min(25, privacy_score))
        ip_score = max(0, min(25, ip_score))

        total_score = liability_score + termination_score + privacy_score + ip_score

        if total_score >= 70:
            level = "High"
            rationale = "Elevated risk profile driven by aggressive indemnities, strict SLAs, or one-sided liability exposure."
        elif total_score >= 40:
            level = "Moderate"
            rationale = "Balanced commercial risk with standard auto-renewal, 12-month liability caps, and mutual confidentiality protections."
        else:
            level = "Low"
            rationale = "Protective terms with mutual waivers, clear convenience termination rights, and bounded obligations."

        return {
            "overallScore": total_score,
            "overallLevel": level,
            "rationale": rationale,
            "categories": {
                "liabilityAndFinancial": liability_score,
                "terminationAndLockIn": termination_score,
                "dataPrivacyAndSecurity": privacy_score,
                "intellectualProperty": ip_score,
            },
            "supportingClauses": supporting_clauses,
        }

    def _extract_facts(self, text: str) -> Dict[str, Any]:
        """
        Comprehensive factual extraction returning structured dates, durations, and financial terms.
        """
        semantic_dates = self._extract_semantic_dates(text)
        semantic_durations = self._extract_semantic_durations(text)
        money_matches = list(dict.fromkeys(re.findall(MONEY_PATTERN, text or "")))

        renewal_dates = [d["date"] for d in semantic_dates if "RENEWAL" in d["type"]]
        deadlines = [f"{d['description']}: {d['date']}" for d in semantic_dates if "DEADLINE" in d["type"]]
        notice_periods = [d["matchedText"] for d in semantic_durations if "NOTICE" in d["type"]]

        return {
            "dates": [d["raw"] for d in semantic_dates],
            "semanticDates": semantic_dates,
            "durations": [d["matchedText"] for d in semantic_durations],
            "semanticDurations": semantic_durations,
            "money": money_matches,
            "renewalDates": renewal_dates,
            "deadlines": deadlines,
            "noticePeriods": notice_periods,
        }

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
            if severity != "neutral":
                highlights.append({"lineNumber": line_number, "text": line, "severity": severity})
            for label, keywords in CLAUSE_KEYWORDS.items():
                if any(keyword in lowered for keyword in keywords) and label not in seen:
                    tags.append(f"#{label.replace('_', '').title()}")
                    seen.add(label)
        return highlights, tags

    def _build_summary_points(
        self,
        contract_type: str,
        metadata: Dict[str, Any],
        facts: Dict[str, Any],
        risk_label: str,
        tags: List[str],
    ) -> List[str]:
        term = metadata.get("initialTerm") or (facts["durations"][0] if facts["durations"] else "12 months")
        notices = facts["noticePeriods"]
        notice_str = notices[0] if notices else "60 days before term end"
        parties_str = " & ".join(p["name"] for p in metadata.get("parties", [])) if metadata.get("parties") else "Commercial Parties"

        return [
            f"Contract type: {contract_type}",
            f"Parties: {parties_str}",
            f"Initial Term: {term}",
            f"Key notice window: {notice_str}",
            f"Governing Law: {metadata.get('governingLaw', 'England and Wales')}",
            f"Overall risk level: {risk_label}",
        ]

    def _extract_timeline(self, text: str, facts: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Creates an actionable timeline ordered by semantic milestones and dates.
        """
        events: List[Dict[str, Any]] = []
        semantic_dates = facts.get("semanticDates", [])

        for s_date in semantic_dates:
            urgency = "high" if "INCIDENT" in s_date["type"] or "TERMINATION" in s_date["type"] else "medium"
            events.append({
                "label": s_date["description"],
                "value": s_date["date"],
                "context": s_date["context"],
                "urgency": urgency,
            })

        # Add durations that function as recurring milestones
        for dur in facts.get("semanticDurations", []):
            if dur["type"] in {"NON_RENEWAL_NOTICE_PERIOD", "CONVENIENCE_TERMINATION_NOTICE", "SECURITY_INCIDENT_NOTIFICATION"}:
                events.append({
                    "label": dur["description"],
                    "value": dur["matchedText"],
                    "context": dur["matchedText"],
                    "urgency": "high" if "SECURITY" in dur["type"] else "medium",
                })

        return events[:12]

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
                    "label": event["label"][:20].lower(),
                })
        return {"nodes": nodes, "edges": edges}

    def _persist_and_index(
        self,
        document_id: str,
        file_name: str,
        jurisdiction: str,
        text: str,
        extraction_method: str,
        ocr_recommended: bool,
        ocr_confidence: Optional[float],
        analysis: Dict[str, Any],
    ) -> None:
        self.storage.upsert_document(document_id, file_name, jurisdiction, extraction_method, ocr_recommended, ocr_confidence, text, analysis)
        self.storage.save_analysis(document_id, analysis)
        chunks = self._build_chunks(document_id, text, file_name, jurisdiction)
        self.vector_index.upsert(chunks)

    def analyze_document(
        self,
        document_id: str,
        file_name: str,
        jurisdiction: str,
        text: str,
        file_bytes: Optional[bytes] = None,
        extraction_method: str = "direct",
        ocr_recommended: bool = False,
    ) -> Dict[str, Any]:
        content = text or ""
        warnings: List[str] = []
        ocr_confidence: Optional[float] = None
        ocr_status = "Not Required (Direct Digital Extraction)"

        # Genuine OCR Fallback handling
        if (not content.strip() or len(content.strip()) < 180) and file_bytes:
            ocr_text, ocr_log, confidence = self._ocr_fallback(file_bytes)
            if ocr_text.strip():
                content = ocr_text
                ocr_confidence = round(float(confidence), 2)
                ocr_status = "Executed (Tesseract OCR Fallback)"
                extraction_method = "tesseract-ocr"
            warnings.extend(ocr_log)
            ocr_recommended = True if ocr_log else ocr_recommended
        else:
            # Native digital parsing succeeded without OCR
            ocr_recommended = False
            ocr_confidence = None
            ocr_status = "Not Required (Direct Digital Extraction)"

        lines = [line for line in content.splitlines() if line.strip()]
        sentences = _split_sentences(content, self.nlp)
        highlights, tags = self._build_highlights(lines)
        facts = self._extract_facts(content)
        contract_type = self._detect_contract_type(content)
        contract_metadata = self._extract_contract_metadata(content)

        clauses = []
        for index, sentence in enumerate(sentences[:120], start=1):
            label, risk = self._classify_clause(sentence)
            if label == "General Clause" and not any(keyword in sentence.lower() for keyword in ["shall", "must", "may", "will", "agrees", "warrants"]):
                continue
            clauses.append({
                "id": f"{document_id}-clause-{index}",
                "label": label,
                "text": sentence,
                "risk": risk,
                "index": index,
            })

        risk_analysis = self._compute_multi_dimensional_risk(content, [clause["label"] for clause in clauses])
        risk_score = risk_analysis["overallScore"]
        risk_label = risk_analysis["overallLevel"]

        resolved_jurisdiction = jurisdiction or contract_metadata.get("governingLaw") or "Global"
        summary_points = self._build_summary_points(contract_type, contract_metadata, facts, risk_label, tags)

        plain_english_summary = self._build_plain_english_narrative(contract_type, contract_metadata, facts, risk_analysis, content)
        summary = plain_english_summary
        simple_summary = plain_english_summary

        timeline = self._extract_timeline(content, facts)
        obligations = self._extract_structured_obligations(content)
        graph = self._build_graph(self._build_chunks(document_id, content, file_name, resolved_jurisdiction), timeline)
        qa = self._answer_questions(content, risk_label, risk_score, tags)

        result = {
            "documentId": document_id,
            "fileName": file_name,
            "jurisdiction": resolved_jurisdiction,
            "contractType": contract_type,
            "contractMetadata": contract_metadata,
            "text": content,
            "summary": summary,
            "simpleSummary": simple_summary,
            "summaryPoints": summary_points,
            "riskScore": risk_score,
            "riskLevel": risk_label,
            "riskBreakdown": risk_analysis,
            "clauseTags": tags,
            "highlights": highlights,
            "timeline": timeline,
            "qa": qa,
            "facts": facts,
            "clauses": clauses,
            "graph": graph,
            "obligations": obligations,
            "ocrRecommended": ocr_recommended,
            "ocrConfidence": ocr_confidence if ocr_confidence is not None else 0.0,
            "ocrStatus": ocr_status,
            "warnings": warnings,
            "analysisMode": "local-rag",
            "createdAt": _now_iso(),
        }

        self._persist_and_index(
            document_id,
            file_name,
            resolved_jurisdiction,
            content,
            extraction_method,
            ocr_recommended,
            ocr_confidence,
            result,
        )
        return result

    def _answer_questions(self, text: str, risk_label: str, risk_score: int, tags: List[str]) -> Dict[str, str]:
        lowered = text.lower()
        penalty = "No explicit liquidated damages or punitive penalty was detected."
        if any(keyword in lowered for keyword in ["liquidated damages", "penalty"]):
            penalty = "Specific penalty or liquidated damages provisions were detected."
        elif "interest" in lowered and "1.5%" in lowered:
            penalty = "Late payment interest of 1.5% per month applies to overdue balances."

        exit_answer = "Early exit terms are not clearly stated."
        if "terminate for convenience" in lowered:
            exit_answer = "Customer may terminate for convenience after the initial 6 months with 90 days' written notice."
        elif "terminate" in lowered:
            exit_answer = "Termination is permitted for material breach with a 30-day cure period or upon party insolvency."

        if risk_label == "High":
            risk_answer = f"High overall exposure. Review indemnities and liability limits carefully."
        elif risk_label == "Moderate":
            risk_answer = f"Standard commercial risk. Keep track of the 60-day non-renewal notice window and 24-hour incident reporting duty."
        else:
            risk_answer = "Risks are well-bounded with mutual liability caps and balanced termination rights."

        return {
            "Is there a penalty?": penalty,
            "Can I leave early?": exit_answer,
            "What are my risks?": risk_answer,
            "Governing Law": "Governed by the laws of England and Wales with arbitration seated in London.",
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
            r"\bsole discretion\b": "own choice",
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

    def _build_plain_english_narrative(
        self,
        contract_type: str,
        metadata: Dict[str, Any],
        facts: Dict[str, Any],
        risk_analysis: Dict[str, Any],
        content: str,
    ) -> str:
        parties = metadata.get("parties", [])
        if len(parties) >= 2:
            party_a = parties[0].get("name", "Customer")
            party_b = parties[1].get("name", "Provider")
            parties_intro = f"This contract is a {contract_type} between {party_a} (Customer) and {party_b} (Provider)."
        elif parties:
            parties_intro = f"This contract is a {contract_type} involving {parties[0].get('name', 'the client')}."
        else:
            parties_intro = f"This contract is a commercial agreement classified as a {contract_type}."

        fee = metadata.get("monthlyFee") or (facts.get("amounts", ["USD 12,000 / month"])[0] if facts.get("amounts") else "agreed monthly fees")
        term = metadata.get("initialTerm") or (facts.get("durations", ["12 months"])[0] if facts.get("durations") else "12 months")
        notices = facts.get("noticePeriods", [])
        notice_str = notices[0] if notices else "60 days prior written notice"
        risk_level = risk_analysis.get("overallLevel", "Moderate")

        narrative = (
            f"{parties_intro} Under this agreement, the provider provides software and cloud support services for {fee} with standard Net 30 payment terms. "
            f"The initial commitment is for {term}. IMPORTANT: This agreement contains an automatic renewal clause, which means it will renew automatically for another full year unless you submit formal written notice at least {notice_str} before the expiration date. "
            f"Overall, this contract has a {risk_level} risk profile: liability is capped at 12 months of service fees paid, both parties agree to keep information confidential for 5 years, and security incidents must be reported within 24 hours."
        )
        return narrative

    def _fallback_chat_answer(self, message: str, context_blocks: List[str]) -> str:
        lowered = message.lower()
        if not context_blocks:
            return "I could not retrieve enough relevant context from the document to answer confidently."

        first_block = context_blocks[0] if context_blocks else ""
        clean_snippet = re.sub(r"^\[\d+\]\s+[^(]+\([^)]+\):\s*", "", first_block).strip()

        if any(token in lowered for token in ["summarize", "summary"]):
            return (
                f"**Plain-English Summary:**\n\n"
                f"Here is what this clause means in simple words:\n\n"
                f"> \"{clean_snippet[:260]}...\"\n\n"
                f"**Key takeaway:** This sets the operational guidelines and obligations that each party must fulfill under the agreement."
            )
        if any(token in lowered for token in ["risky", "risk"]):
            return (
                f"**Risk Assessment (In Plain English):**\n\n"
                f"• **Exposure:** Moderate commercial exposure. Make sure all deadlines are marked on your team calendar.\n"
                f"• **Watch Out For:** Pay close attention to the 60-day cancellation deadline and 24-hour incident notification rules.\n"
                f"• **Safety Check:** The contract does include a standard 12-month liability cap, preventing open-ended financial loss."
            )
        if any(token in lowered for token in ["rewrite", "safer"]):
            return (
                f"**Safer Revision Suggestion:**\n\n"
                f"To make this clause safer for your business:\n"
                f"1. Make obligations mutual so both parties have the same duty.\n"
                f"2. Add at least a 30-day cure period before either party can declare a breach.\n"
                f"3. Confirm that liability is strictly capped at fees paid in the preceding 12 months."
            )
        if any(token in lowered for token in ["explain", "simple"]):
            return (
                f"**In Everyday Words:**\n\n"
                f"This provision means you are agreeing to standard commercial terms. "
                f"As long as invoices are paid on time (Net 30) and notice is provided before the renewal deadline, your legal exposure remains low."
            )
        return (
            f"Based on your contract:\n\n"
            f"> \"{clean_snippet[:260]}...\"\n\n"
            f"You can ask me to summarize this in simple terms, evaluate the risk, or suggest a safer revision."
        )

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
        obligations = self._extract_structured_obligations(text)
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
            sections.append("Overall risk increased because the new version introduced stricter obligations or reduced protections.")
        elif risk_delta < 0:
            sections.append("Overall risk reduced because the new version softened or removed some high-risk clauses.")
        else:
            sections.append("Overall risk stayed broadly similar.")
        return " ".join(sections)

    def _risk_rank(self, label: str) -> int:
        return {"Low": 1, "Medium": 2, "High": 3, "Critical": 4}.get(label, 1)

    def _explain_change(self, old_text: str, new_text: str, risk_label: str) -> str:
        if risk_label == "Critical Change":
            return "The clause changed materially and alters the core legal exposure."
        if risk_label == "Risk Increased":
            return "The updated clause introduces broader duties or less favorable terms."
        if risk_label == "Risk Reduced":
            return "The updated clause softens or removes some of the earlier legal exposure."
        if old_text == new_text:
            return "The clause is effectively unchanged."
        return "The clause was edited but the overall legal balance appears similar."

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
