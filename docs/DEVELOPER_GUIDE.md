# Legal AI Platform v2.1 — Developer Guide

This developer guide is a practical reference manual explaining how the system starts, operates, processes documents, runs intelligence pipelines, and recovers when things break.

---

## Table of Contents
1. [Application Startup Lifecycle](#1-application-startup-lifecycle)
2. [Docker Compose & Container Networking](#2-docker-compose--container-networking)
3. [Frontend Architecture (React + Vite)](#3-frontend-architecture)
4. [Backend Architecture (Spring Boot 3 WebFlux)](#4-backend-architecture)
5. [AI Service Architecture (FastAPI + NLP + Embeddings)](#5-ai-service-architecture)
6. [PostgreSQL Persistence & Flyway](#6-postgresql-persistence--flyway)
7. [Redis Caching (Reactive)](#7-redis-caching-reactive)
8. [ChromaDB Vector Store](#8-chromadb-vector-store)
9. [Ollama & Local LLM Integration](#9-ollama--local-llm-integration)
10. [Nginx Gateway Routing](#10-nginx-gateway-routing)
11. [Document Analysis Flow](#11-document-analysis-flow)
12. [RAG Pipeline & Retrieval Mechanics](#12-rag-pipeline--retrieval-mechanics)
13. [Copilot REST & Context Augmentation](#13-copilot-rest--context-augmentation)
14. [WebSocket Streaming Protocol](#14-websocket-streaming-protocol)
15. [Knowledge Graph Intelligence](#15-knowledge-graph-intelligence)
16. [Timeline Intelligence](#16-timeline-intelligence)
17. [Configuration Management](#17-configuration-management)
18. [Debugging Runbooks](#18-debugging-runbooks)
19. [Testing Procedures](#19-testing-procedures)
20. [Common Failure Scenarios & Troubleshooting](#20-common-failure-scenarios--troubleshooting)

---

## 1. Application Startup Lifecycle

When you launch the system via `docker compose up -d` or `./run.bat` / `start-project.ps1`:

1. **Storage Volumes & Healthchecks**:
   - `postgres` (PostgreSQL 16) starts and initializes its data volume. Its healthcheck polls `pg_isready -U legalai -d legalai`.
   - `redis` (Redis 7) starts and initializes its in-memory store. Its healthcheck polls `redis-cli ping`.
2. **AI Service (`nlp-service`)**:
   - Spawns Uvicorn on port 5000 running `app.main:app`.
   - On startup, loads spaCy English sentencizer, checks ChromaDB persistence directory (`/data/chroma`), and initializes Sentence Transformers (`all-MiniLM-L6-v2`) in memory.
3. **Backend Service (`backend`)**:
   - Waits for `postgres` and `redis` health checks to pass (`condition: service_healthy`).
   - Netty WebFlux server starts on port 8080.
   - Flyway migration `V1__init.sql` executes via JDBC, verifying/creating `documents` and `conversation_messages` tables.
   - R2DBC reactive connection pool initializes to `r2dbc:postgresql://postgres:5432/legalai`.
   - Lettuce reactive Redis connection initializes to `redis:6379`.
4. **Frontend Service (`frontend`)**:
   - Nginx alpine container serves pre-compiled production Vite bundle from `/usr/share/nginx/html` on internal port 80.
5. **Gateway (`gateway`)**:
   - Public Nginx reverse proxy listens on `0.0.0.0:80`.
   - Routes `/api/` to `backend:8080/api/`.
   - Routes `/ws/` to `backend:8080/ws/` with HTTP/1.1 Upgrade headers.
   - Routes `/` to `frontend:80`.

---

## 2. Docker Compose & Container Networking

All 6 services belong to a default bridge network created by Docker Compose:

```
                  [ Host Browser / Client: Port 80 ]
                                 │
                     ┌───────────▼───────────┐
                     │   gateway (Nginx)     │
                     └─────┬───────────┬─────┘
           /api/ & /ws/    │           │   / (Static HTML/JS)
    ┌──────────────────────┘           └──────────────────────┐
    ▼                                                         ▼
┌────────────────────────┐                        ┌────────────────────────┐
│  backend (Spring Boot) │                        │   frontend (Nginx)     │
└────┬─────────┬─────────┘                        └────────────────────────┘
     │         │
     │         │ HTTP REST
     │    ┌────▼──────────────────────────────────┐
     │    │   nlp-service (FastAPI on Port 5000)   │
     │    └────┬─────────────────┬────────────────┘
     │         │                 │
     │         ▼                 ▼
     │    ChromaDB (Local)   Ollama (Host 11434)
     │
     ├──────────────────────────┐
     ▼                          ▼
┌───────────────────┐    ┌───────────────────┐
│ postgres (Port 5432)│    │ redis (Port 6379) │
└───────────────────┘    └───────────────────┘
```

**DNS Resolution**:
Containers resolve each other by Docker service names (`gateway`, `backend`, `frontend`, `nlp-service`, `postgres`, `redis`).

---

## 3. Frontend Architecture

- **Framework**: React 19 + Vite 5 + TailwindCSS.
- **Location**: `apps/frontend/`.
- **Key Files**:
  - `src/features/dashboard/Dashboard.jsx`: Central operational hub rendering metric cards, timeline, clause cards, knowledge graph, and copilot drawer.
  - `src/features/copilot/CopilotDrawer.jsx`: Real-time streaming legal assistant supporting both REST fallback and WebSocket connection.
  - `src/features/comparison/DocumentComparison.jsx`: Side-by-side contractual diffing and delta risk analysis.
  - `src/api/client.js`: Centralized Axios/fetch client pointing to relative `/api` paths.

> **What should I look at first if this breaks?**
> Check the browser developer console (F12) for HTTP 4xx/5xx or WebSocket disconnects. Check `apps/frontend/src/api/client.js` base URL configuration.

---

## 4. Backend Architecture

- **Framework**: Spring Boot 3.1.2 with Spring WebFlux (Project Reactor / Netty).
- **Location**: `apps/backend/`.
- **Key Modules**:
  - `com.legalai.modules.documents.api.DocumentController`: Handles multipart document upload (`/api/documents/upload`), contract comparison (`/api/documents/compare`), and text simplification (`/api/documents/simplify`).
  - `com.legalai.modules.documents.service.DocumentExtractionService`: Extracts text from PDF (Apache PDFBox 3) and DOCX (Apache POI 5.2.3) on `Schedulers.boundedElastic()`.
  - `com.legalai.modules.documents.service.DocumentPersistenceService`: Persists uploaded metadata and analysis JSON into PostgreSQL `documents` table.
  - `com.legalai.infrastructure.cache.LegalCacheService`: Caches document analysis and text simplification in Redis.
  - `com.legalai.modules.ai.api.CopilotController`: REST endpoints for chat (`/api/copilot/chat`), retrieval (`/api/copilot/retrieve`), and history (`/api/copilot/history/{documentId}`).
  - `com.legalai.modules.ai.service.ChatHistoryService`: Coordinates query answering, chat turn persistence in PostgreSQL, and fallback logic.
  - `com.legalai.infrastructure.storage.PostgresChatHistoryStore`: Reactive R2DBC repository for `conversation_messages` with safe UUID mapping.
  - `com.legalai.infrastructure.websocket.LegalChatWebSocketHandler`: Real-time WebSocket handler streaming tokens to clients.

> **What should I look at first if this breaks?**
> Run `docker logs --tail 50 ailegaldocumentanalyser-backend-1`. Look for R2DBC connection timeouts, unhandled Mono errors, or WebClient REST call failures.

---

## 5. AI Service Architecture

- **Framework**: FastAPI (Python 3.11).
- **Location**: `apps/ai-service/`.
- **Key Modules**:
  - `app/services/intelligence_engine.py`: Core legal intelligence engine:
    - `_detect_contract_type`: Hierarchical preamble-weighted classification (never confuses commercial with employment).
    - `_compute_multi_dimensional_risk`: 4-category balanced scoring (Liability, Termination, Data Privacy, IP) with explainable rationales.
    - `_extract_semantic_dates`: Distance-based proximity disambiguation for contract milestones (Effective Date, Expiration, Notice Deadlines).
    - `_extract_semantic_durations`: Standardized contract period extractor (Initial Term, Renewal, Non-Renewal Notice, Cure, Survival).
    - `_extract_structured_obligations`: Party-attributed legal duties with triggers, deadlines, frequencies, and consequences.
    - `_extract_contract_metadata`: Preamble parsing for Parties, Governing Law, and Recurring Fees.
  - `app/api/routes/legacy.py`: REST routes for `/api/analyze-document`, `/api/copilot/chat`, `/api/copilot/retrieve`, `/api/intelligence/graph/{id}`, `/api/intelligence/timeline/{id}`, `/simplify`.

> **What should I look at first if this breaks?**
> Run `docker logs --tail 50 ailegaldocumentanalyser-nlp-service-1`. Check for Pydantic 422 validation errors or SentenceTransformers OOM errors.

---

## 6. PostgreSQL Persistence & Flyway

- **Database**: PostgreSQL 16 on port 5432 (`legalai`).
- **Flyway Migrations**: Located at `apps/backend/src/main/resources/db/migration/V1__init.sql`.
- **Tables**:
  - `documents`: Stores document UUID, filename, jurisdiction, extraction method, OCR status, and full analysis JSONB.
  - `conversation_messages`: Stores chat history (role, content, citations JSONB, timestamp) indexed by `document_id` and `created_at`.
- **UUID Safety**: `safeUuid` maps string document IDs deterministically via `UUID.nameUUIDFromBytes(id.getBytes())` if not already an RFC-4122 UUID, preventing input syntax errors.

> **What should I look at first if this breaks?**
> Run `docker exec ailegaldocumentanalyser-postgres-1 psql -U legalai -d legalai -c "\dt"`. Check if tables exist and migration table `flyway_schema_history` is up to date.

---

## 7. Redis Caching (Reactive)

- **Database**: Redis 7 on port 6379.
- **Service**: `LegalCacheService.java`.
- **Cache Patterns**:
  - `legal:analysis:{documentId}`: Analysis response payload (TTL 24 hours).
  - `legal:simplify:{hash}`: Text simplification cache (TTL 7 days).
- **Failure Isolation**: All Redis operations use `.onErrorResume(err -> Mono.empty())`. If Redis is offline, requests proceed directly without caching.

> **What should I look at first if this breaks?**
> Run `docker exec ailegaldocumentanalyser-redis-1 redis-cli ping`. Inspect keys with `docker exec ailegaldocumentanalyser-redis-1 redis-cli KEYS "*"`.

---

## 8. ChromaDB Vector Store

- **Path**: Persisted to `/data/chroma` in `nlp-service`.
- **Embeddings**: Sentence Transformers (`all-MiniLM-L6-v2`, 384 dimensions).
- **Collection**: `legal_documents`.
- **Indexing**: Chunks are stored with metadata (`document_id`, `chunk_index`, `line_start`, `line_end`, `label`, `risk`).

> **What should I look at first if this breaks?**
> Check disk write permissions on `/data/chroma`. Verify `/data` volume has sufficient disk space.

---

## 9. Ollama & Local LLM Integration

- **URL**: Configured via `OLLAMA_BASE_URL` (default `http://host.docker.internal:11434`).
- **Model**: Configured via `OLLAMA_MODEL` (default `llama3.1:8b`).
- **Graceful Fallback**: If Ollama is not installed or unreachable, `intelligence_engine.py` generates deterministic legal answers grounded in retrieved ChromaDB context chunks.

> **What should I look at first if this breaks?**
> Run `curl http://localhost:11434/api/tags` on the host machine to check if Ollama is running and model `llama3.1:8b` is pulled.

---

## 10. Nginx Gateway Routing

Configured in `infrastructure/nginx/nginx.conf`:
- `/api/` ➔ Proxied to Spring Boot backend (`backend:8080`).
- `/ws/` ➔ Proxied to Spring Boot WebSocket (`backend:8080`) with `Upgrade $http_upgrade` and `Connection "upgrade"`.
- `/` ➔ Proxied to React Vite frontend (`frontend:80`).

> **What should I look at first if this breaks?**
> Check `docker logs ailegaldocumentanalyser-gateway-1`. Check for `502 Bad Gateway` (means backend is restarting or unhealthy).

---

## 11. Document Analysis Flow

```
1. User uploads PDF/DOCX via Frontend
   ↓
2. Gateway proxies multipart form to /api/documents/upload
   ↓
3. Backend DocumentExtractionService strips text (PDFBox / Apache POI)
   ↓
4. Backend calls FastAPI /api/analyze-document
   ↓
5. IntelligenceEngine extracts:
   - Contract type (hierarchical preamble check)
   - Risk score (4-category breakdown)
   - Semantic dates (distance-based disambiguation)
   - Contract durations (term, renewal, notice, cure)
   - Structured obligations (party, trigger, deadline, consequence)
   - Knowledge graph nodes & edges
   - Timeline chronological milestones
   ↓
6. VectorStore indexes chunks into ChromaDB
   ↓
7. Backend persists document in PostgreSQL and caches in Redis
   ↓
8. Frontend renders dashboard with glassmorphic cards
```

---

## 12. RAG Pipeline & Retrieval Mechanics

1. **Chunking**: Text is split into coherent clause blocks (180 words max) respecting line boundaries.
2. **Embedding**: SentenceTransformer `all-MiniLM-L6-v2` produces dense vectors.
3. **Indexing**: ChromaDB indexes vectors with document metadata filter.
4. **Querying**: Top-k most similar clauses are retrieved using cosine distance.
5. **Synthesis**: Context is injected into the prompt and passed to Ollama (or synthesized if local LLM is disabled).

---

## 13. Copilot REST & Context Augmentation

Endpoint: `POST /api/copilot/chat`
Payload:
```json
{
  "documentId": "f8e98cbe-13e0-4513-bd79-c91133fdec95",
  "message": "What is the initial term and monthly fee?"
}
```
Response:
- Grounded answer with section references.
- `citations`: Array of source clause IDs, line numbers, and text excerpts.
- Chat turns automatically saved to PostgreSQL `conversation_messages`.

---

## 14. WebSocket Streaming Protocol

URL: `ws://localhost/ws/copilot`
Payload format:
```json
{
  "messageId": "msg-101",
  "documentId": "f8e98cbe-13e0-4513-bd79-c91133fdec95",
  "message": "What are the termination conditions?"
}
```
Frame stream:
1. `{"type": "chunk", "messageId": "msg-101", "chunk": "Either party may terminate..."}`
2. `{"type": "done", "messageId": "msg-101", "answer": "...", "citations": [...]}`
3. On failure: `{"type": "error", "messageId": "msg-101", "message": "..."}`

---

## 15. Knowledge Graph Intelligence

Endpoint: `GET /api/intelligence/graph/{documentId}`
- Nodes represent clauses, legal entities, parties, and obligations.
- Edges represent relationships (`follows`, `obligates`, `governs`, `limits`).
- Visualized on the frontend using ReactFlow with custom glassmorphic node styling.

---

## 16. Timeline Intelligence

Endpoint: `GET /api/intelligence/timeline/{documentId}`
- Chronologically orders dates, deadlines, and notice windows extracted from the agreement.
- Tags milestones by contractual category (Effective Date, Payment, Non-Renewal, Expiration).

---

## 17. Configuration Management

| Variable | Default | Component | Purpose |
|----------|---------|-----------|---------|
| `NLP_SERVICE_URL` | `http://nlp-service:5000` | Backend | FastAPI service endpoint |
| `SPRING_R2DBC_URL` | `r2dbc:postgresql://postgres:5432/legalai` | Backend | Reactive Postgres URL |
| `SPRING_DATA_REDIS_HOST` | `redis` | Backend | Redis host |
| `SPRING_DATA_REDIS_PORT` | `6379` | Backend | Redis port |
| `OLLAMA_BASE_URL` | `http://host.docker.internal:11434` | AI Service | Local LLM host |
| `OLLAMA_MODEL` | `llama3.1:8b` | AI Service | LLM model tag |
| `LEGAL_DATA_DIR` | `/data` | AI Service | ChromaDB & SQLite persistence |

---

## 18. Debugging Runbooks

### Checking Service Health
```bash
# Gateway to Backend
docker exec ailegaldocumentanalyser-gateway-1 wget -qO- http://backend:8080/actuator/health

# AI Service direct
docker exec ailegaldocumentanalyser-nlp-service-1 python -c "import requests; print(requests.get('http://localhost:5000/health').json())"

# PostgreSQL queries
docker exec ailegaldocumentanalyser-postgres-1 psql -U legalai -d legalai -c "SELECT count(*) FROM documents;"

# Redis keys
docker exec ailegaldocumentanalyser-redis-1 redis-cli KEYS "*"
```

---

## 19. Testing Procedures

### Running Intelligence Regression Tests
```bash
docker exec ailegaldocumentanalyser-nlp-service-1 python /app/ai_tests/test_intelligence.py
```
Expected output:
```
--- 1. CONTRACT CLASSIFICATION ---
[PASS] Classification accurately identified as Software Services / Commercial Agreement
--- 2. OCR REPORTING ---
[PASS] OCR is properly reported as Not Required for native digital extraction
--- 3. BALANCED RISK SCORING ---
[PASS] Risk score is balanced and explainable (not saturated 100)
--- 4. SEMANTIC DATES ---
[PASS] Semantic dates accurately extracted and normalized to ISO 8601
--- 5. SEMANTIC DURATIONS ---
[PASS] All key contractual durations identified and semantically differentiated
--- 6. STRUCTURED OBLIGATIONS ---
[PASS] Structured obligations extracted with parties, triggers, and deadlines
--- 7. CONTRACT METADATA ---
[PASS] Core contract metadata extracted accurately
```

### Running Backend Unit & Integration Tests
```bash
cd apps/backend
mvn test
```

---

## 20. Common Failure Scenarios & Troubleshooting

### Scenario A: "422 Unprocessable Entity" on Chat Request
- **Cause**: Pydantic schema mismatch when client passes `null` for optional list fields (e.g., `history`).
- **Fix**: Verify `history: Optional[List[Any]] = Field(default_factory=list)` in `apps/ai-service/app/api/routes/legacy.py`.

### Scenario B: "PSQLException: invalid input syntax for type uuid"
- **Cause**: Casting arbitrary string document IDs directly to `:documentId::uuid` in PostgreSQL.
- **Fix**: Use `safeUuid(documentId)` which deterministically hashes non-UUID strings to RFC-4122 UUIDs.

### Scenario C: "502 Bad Gateway" on Frontend
- **Cause**: Nginx gateway cannot reach `backend:8080` (Spring Boot is recompiling or crashed).
- **Fix**: Run `docker logs ailegaldocumentanalyser-backend-1` to check startup errors.
