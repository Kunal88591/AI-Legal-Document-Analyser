from flask import Flask, jsonify, request

from services import IntelligenceEngine

app = Flask(__name__)
engine = IntelligenceEngine()


@app.get("/health")
def health():
    return jsonify({"status": "ok", "service": "legal-nlp", "ready": True})


@app.post("/api/analyze-document")
def analyze_document():
    document_id = request.form.get("documentId") or str(uuid.uuid4())
    file_name = request.form.get("fileName") or (request.files["file"].filename if "file" in request.files else "document")
    jurisdiction = request.form.get("jurisdiction") or "Global"
    text = request.form.get("text") or ""
    extraction_method = request.form.get("extractionMethod") or "unknown"
    ocr_recommended = str(request.form.get("ocrRecommended", "false")).lower() == "true"
    file_bytes = request.files["file"].read() if "file" in request.files else None
    result = engine.analyze_document(document_id, file_name, jurisdiction, text, file_bytes, extraction_method, ocr_recommended)
    return jsonify(result)


@app.post("/api/compare-contracts")
def compare_contracts():
    payload = request.get_json(force=True, silent=True) or {}
    result = engine.compare_contracts(
        payload.get("oldText", ""),
        payload.get("newText", ""),
        payload.get("oldFileName", "Old Contract"),
        payload.get("newFileName", "New Contract"),
    )
    return jsonify(result)


@app.post("/api/copilot/chat")
def copilot_chat():
    payload = request.get_json(force=True, silent=True) or {}
    result = engine.chat(
        payload.get("documentId", "unknown"),
        payload.get("message", ""),
        payload.get("history", []),
        payload.get("jurisdiction", "Global"),
    )
    return jsonify(result)


@app.post("/api/copilot/retrieve")
def copilot_retrieve():
    payload = request.get_json(force=True, silent=True) or {}
    result = engine.retrieve(
        payload.get("documentId", "unknown"),
        payload.get("query", ""),
        int(payload.get("topK", 5)),
    )
    return jsonify(result)


@app.get("/api/copilot/history/<document_id>")
def copilot_history(document_id: str):
    return jsonify(engine.history(document_id))


@app.get("/api/intelligence/graph/<document_id>")
def graph(document_id: str):
    return jsonify(engine.graph(document_id))


@app.get("/api/intelligence/timeline/<document_id>")
def timeline(document_id: str):
    return jsonify(engine.timeline(document_id))


@app.post("/simplify")
def simplify():
    payload = request.get_json(force=True, silent=True) or {}
    return jsonify(engine.simplify(payload.get("text", "")))


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
