# Legal AI Platform v2.1 — Codebase Knowledge Map

This document provides a component-by-component navigation map of every critical module, class, function, dependency, and data flow in the repository.

---

## 1. Gateway & Infrastructure Layer

### `infrastructure/nginx/nginx.conf`
- **Component**: Gateway Reverse Proxy
- **Responsibility**: Listens on port 80; routes `/api/*` and `/ws/*` to Spring Boot WebFlux backend, and `/*` to the React/Vite frontend static files.
- **Dependencies**: Nginx 1.27 Alpine.
- **Data Flow**: `Client Browser ➔ Port 80 ➔ Backend (8080) / Frontend (80)`.

### `docker-compose.yml`
- **Component**: Multi-Container Orchestration
- **Services Defined**:
  1. `gateway`: Nginx reverse proxy
  2. `backend`: Spring Boot 3 WebFlux reactive backend
  3. `nlp-service`: FastAPI AI intelligence & RAG service
  4. `postgres`: PostgreSQL 16 relational database
  5. `redis`: Redis 7 reactive in-memory cache
  6. `frontend`: React 19 + Vite Nginx container
- **Volumes**: `legal-backend-data`, `legal-nlp-data`, `legal-postgres-data`, `legal-redis-data`.

---

## 2. Backend Service (`apps/backend`)

### `com.legalai.modules.documents.api.DocumentController`
- **File**: `apps/backend/src/main/java/com/legalai/modules/documents/api/DocumentController.java`
- **Main Endpoints**:
  - `POST /api/documents/upload`: Multipart document upload.
  - `POST /api/documents/compare`: Multipart dual-document diff.
  - `POST /api/documents/simplify`: JSON plain-language text rewrite.
- **Dependencies**: `DocumentExtractionService`, `NlpGatewayClient`, `DocumentPersistenceService`, `LegalCacheService`, `ObjectMapper`.
- **Data Flow**:
  - Offloads PDFBox/POI text parsing to `Schedulers.boundedElastic()`.
  - Dispatches extracted text & binary payload to FastAPI `POST /api/analyze-document`.
  - Asynchronously saves document metadata & analysis JSON to PostgreSQL `documents` table.
  - Returns `AnalysisResponse` to client.

### `com.legalai.modules.documents.service.DocumentExtractionService`
- **File**: `apps/backend/src/main/java/com/legalai/modules/documents/service/DocumentExtractionService.java`
- **Main Methods**:
  - `extract(fileName, bytes)`: Inspects extension (`pdf`, `docx`, `txt`).
  - `extractTextFromPdf(bytes)`: Apache PDFBox `Loader.loadPDF` and `PDFTextStripper`.
  - `extractTextFromDocx(bytes)`: Apache POI `XWPFWordExtractor`.
- **Responsibility**: Direct digital text extraction; accurately flags sparse/scanned documents for OCR without fabricating fake OCR confidence scores.

### `com.legalai.modules.documents.service.DocumentPersistenceService`
- **File**: `apps/backend/src/main/java/com/legalai/modules/documents/service/DocumentPersistenceService.java`
- **Main Methods**:
  - `saveDocument(docId, fileName, jurisdiction, extractionMethod, ocrRecommended, ocrConfidence, analysis)`: Reactive R2DBC upsert into PostgreSQL `documents` table.
- **Dependencies**: `DatabaseClient`, `ObjectMapper`.

### `com.legalai.infrastructure.cache.LegalCacheService`
- **File**: `apps/backend/src/main/java/com/legalai/infrastructure/cache/LegalCacheService.java`
- **Main Methods**:
  - `getCachedAnalysis(documentId)` / `cacheAnalysis(documentId, json)`
  - `getCachedSimplification(hash)` / `cacheSimplification(hash, json)`
- **Dependencies**: `ReactiveStringRedisTemplate`.
- **Responsibility**: Low-latency caching for frequent analyses and text simplifications with seamless fallback if Redis is offline.

### `com.legalai.modules.ai.api.CopilotController`
- **File**: `apps/backend/src/main/java/com/legalai/modules/ai/api/CopilotController.java`
- **Main Endpoints**:
  - `POST /api/copilot/chat`: Context-grounded copilot dialogue.
  - `POST /api/copilot/retrieve`: Vector search retrieval chunks.
  - `GET /api/copilot/history/{documentId}`: Chat history retrieval.
- **Dependencies**: `ChatHistoryService`, `NlpGatewayClient`.

### `com.legalai.modules.ai.service.ChatHistoryService`
- **File**: `apps/backend/src/main/java/com/legalai/modules/ai/service/ChatHistoryService.java`
- **Main Methods**:
  - `chatAndPersist(request)`: Executes chat via `NlpGatewayClient`, persists user and assistant turns to `PersistentChatHistoryStore`, and returns the `ChatResponse`.
  - `history(documentId)`: Loads saved turns from PostgreSQL, falling back to AI service storage.
- **Reactive Pattern**: Uses `.onErrorResume(error -> Mono.empty()).then(Mono.just(response))` to guarantee non-empty Mono emission.

### `com.legalai.infrastructure.storage.PostgresChatHistoryStore`
- **File**: `apps/backend/src/main/java/com/legalai/infrastructure/storage/PostgresChatHistoryStore.java`
- **Main Methods**:
  - `appendMessage(documentId, role, content, citations)`: Inserts turn into `conversation_messages`.
  - `getHistory(documentId, limit)`: Queries turns ordered by `created_at ASC`.
  - `safeUuid(documentId)`: Deterministically hashes custom document slugs to standard RFC-4122 UUIDs to prevent input syntax exceptions.

### `com.legalai.infrastructure.websocket.LegalChatWebSocketHandler`
- **File**: `apps/backend/src/main/java/com/legalai/infrastructure/websocket/LegalChatWebSocketHandler.java`
- **Main Methods**:
  - `handle(session)`: Receives incoming frames, processes chat requests, and streams response tokens back over WebSocket connection `/ws/copilot`.

---

## 3. AI Service (`apps/ai-service`)

### `app.services.intelligence_engine.IntelligenceEngine`
- **File**: `apps/ai-service/app/services/intelligence_engine.py`
- **Responsibility**: Core legal analysis brain.
- **Main Methods**:
  - `analyze_document(...)`: Full pipeline orchestrator returning contract type, risk, facts, obligations, graph, timeline, and summary.
  - `_detect_contract_type(text)`: Hierarchical preamble classifier. Differentiates software/commercial agreements from employment contracts.
  - `_compute_multi_dimensional_risk(clauses, text)`: Balanced 4-category scoring (Liability, Termination, Data Privacy, IP). Prevents 100% saturation.
  - `_extract_semantic_dates(text)`: Distance-based proximity disambiguation for contract dates (Effective Date, Expiration Date, Notice Deadlines).
  - `_extract_semantic_durations(text)`: Categorizes durations (Initial Term, Renewal Period, Notice Period, Cure Period, Survival).
  - `_extract_structured_obligations(text)`: Extracts obligations with party assignment, duty, trigger, deadline, and legal consequence.
  - `_extract_contract_metadata(text)`: Extracts parties, governing law, and payment terms from agreement preamble.
  - `_build_knowledge_graph(chunks, events)`: Assembles nodes and directed edges for legal dependency visualization.
  - `_build_timeline(dates, durations)`: Assembles chronological sequence of contractual events.

### `app.api.routes.legacy`
- **File**: `apps/ai-service/app/api/routes/legacy.py`
- **Endpoints**:
  - `POST /api/analyze-document`: Multipart document analysis.
  - `POST /api/copilot/chat`: Context-grounded question answering.
  - `POST /api/copilot/retrieve`: Vector similarity retrieval.
  - `GET /api/copilot/history/{id}`: Local SQLite conversation history.
  - `GET /api/intelligence/graph/{id}`: Knowledge graph nodes and edges.
  - `GET /api/intelligence/timeline/{id}`: Contractual timeline events.
  - `POST /simplify`: Plain language clause rewriting.

---

## 4. Frontend Service (`apps/frontend`)

### `apps/frontend/src/features/dashboard/Dashboard.jsx`
- **Component**: Primary workspace view.
- **Responsibility**:
  - Manages document upload form, jurisdiction selection, and analysis state.
  - Displays top stat cards (Risk Score, OCR Status, Clause Tags, Timeline Items).
  - Renders Risk Category Breakdown (Liability, Termination, Privacy, IP).
  - Renders Structured Obligations table with party tags and urgency pills.
  - Hosts Knowledge Graph (ReactFlow) and Timeline tabs.
  - Renders Copilot Drawer with WebSocket streaming.

### `apps/frontend/src/features/comparison/DocumentComparison.jsx`
- **Component**: Contract Comparison
- **Responsibility**: Renders side-by-side textual diffs with highlighted risk additions and removals.

### `apps/frontend/src/api/client.js`
- **Component**: API Gateway Client
- **Responsibility**: Provides typed methods (`uploadDocument`, `compareDocuments`, `simplifyText`, `getGraph`, `getTimeline`, `copilotChat`) targeting relative `/api` paths.
