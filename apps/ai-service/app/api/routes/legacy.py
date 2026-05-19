from __future__ import annotations

from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, UploadFile
from pydantic import BaseModel, Field

from app.services.intelligence_engine import IntelligenceEngine


router = APIRouter()
engine = IntelligenceEngine()


class CompareRequest(BaseModel):
    oldFileName: str = "Old Contract"
    newFileName: str = "New Contract"
    oldText: str = ""
    newText: str = ""
    jurisdiction: str = "Global"


class ChatTurn(BaseModel):
    role: str = Field(default="user")
    content: str = Field(default="")
    timestamp: Optional[str] = None


class ChatRequest(BaseModel):
    documentId: str = "unknown"
    message: str = ""
    history: List[Dict[str, Any]] = Field(default_factory=list)
    jurisdiction: str = "Global"


class RetrievalRequest(BaseModel):
    documentId: str = "unknown"
    query: str = ""
    topK: int = 5


class SimplifyRequest(BaseModel):
    text: str = ""


@router.get("/health")
def health() -> Dict[str, Any]:
    return {"status": "ok", "service": "legal-ai", "ready": True}


@router.post("/api/analyze-document")
async def analyze_document(
    documentId: Optional[str] = Form(default=None),
    fileName: Optional[str] = Form(default=None),
    jurisdiction: Optional[str] = Form(default="Global"),
    text: Optional[str] = Form(default=""),
    extractionMethod: Optional[str] = Form(default="unknown"),
    ocrRecommended: Optional[str] = Form(default="false"),
    file: Optional[UploadFile] = File(default=None),
) -> Dict[str, Any]:
    import uuid

    resolved_document_id = documentId or str(uuid.uuid4())

    resolved_file_name = fileName or (file.filename if file else "document")
    resolved_jurisdiction = jurisdiction or "Global"
    resolved_text = text or ""
    resolved_extraction_method = extractionMethod or "unknown"
    resolved_ocr_recommended = (ocrRecommended or "false").lower() == "true"
    file_bytes = await file.read() if file else None

    return engine.analyze_document(
        resolved_document_id,
        resolved_file_name,
        resolved_jurisdiction,
        resolved_text,
        file_bytes,
        resolved_extraction_method,
        resolved_ocr_recommended,
    )


@router.post("/api/compare-contracts")
def compare_contracts(payload: CompareRequest) -> Dict[str, Any]:
    return engine.compare_contracts(
        payload.oldText,
        payload.newText,
        payload.oldFileName,
        payload.newFileName,
    )


@router.post("/api/copilot/chat")
def copilot_chat(payload: ChatRequest) -> Dict[str, Any]:
    return engine.chat(
        payload.documentId,
        payload.message,
        payload.history,
        payload.jurisdiction,
    )


@router.post("/api/copilot/retrieve")
def copilot_retrieve(payload: RetrievalRequest) -> Dict[str, Any]:
    return engine.retrieve(payload.documentId, payload.query, payload.topK)


@router.get("/api/copilot/history/{document_id}")
def copilot_history(document_id: str) -> Dict[str, Any]:
    return engine.history(document_id)


@router.get("/api/intelligence/graph/{document_id}")
def graph(document_id: str) -> Dict[str, Any]:
    return engine.graph(document_id)


@router.get("/api/intelligence/timeline/{document_id}")
def timeline(document_id: str) -> Dict[str, Any]:
    return engine.timeline(document_id)


@router.post("/simplify")
def simplify(payload: SimplifyRequest) -> Dict[str, Any]:
    return engine.simplify(payload.text)
