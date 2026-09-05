# Legal AI Platform v2.1 — Real Architecture

This document specifies the actual production architecture of Legal AI Platform v2.1, detailing data flows, component boundaries, persistence layers, and intelligence mechanics.

---

## 1. System Topology

```
                  [ Host Browser / Client: Port 80 ]
                                 │
                     ┌───────────▼───────────┐
                     │   gateway (Nginx)     │
                     └─────┬───────────┬─────┘
           /api/ & /ws/    │           │   / (Static Web UI)
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

---

## 2. Implemented vs Planned Architecture

### IMPLEMENTED
- **Gateway**: Nginx 1.27 reverse proxy with WebSocket upgrade support.
- **Backend**: Spring Boot 3.1.2 WebFlux on Netty:
  - Non-blocking multipart file processing on `Schedulers.boundedElastic()`.
  - Direct digital extraction via Apache PDFBox 3 and Apache POI 5.2.3.
  - Reactive R2DBC PostgreSQL persistence (`DatabaseClient`) for documents and conversation messages.
  - Flyway schema migrations (`V1__init.sql`).
  - Reactive Redis 7 caching (`ReactiveStringRedisTemplate`) for analysis and text simplification.
  - WebSocket streaming on `/ws/copilot`.
- **AI Service**: Python 3.11 FastAPI service:
  - Hierarchical preamble-based contract classification.
  - Distance-based proximity semantic date extraction.
  - Multi-dimensional balanced risk scoring (4 categories: 0-25 each).
  - 14 contractual duration extractors.
  - Structured party-attributed obligation extraction.
  - ChromaDB persistent vector store (`all-MiniLM-L6-v2` dense embeddings).
  - Local RAG retrieval with optional Ollama generative completion.
- **Frontend**: React 19 + Vite 5:
  - Dark glassmorphic command center.
  - Knowledge graph visualization (ReactFlow).
  - Timeline visualization.
  - Side-by-side contract comparison.
  - Copilot drawer with real-time token streaming.

### PLANNED (Future Roadmap)
- Distributed microservice decomposition of `intelligence_engine.py` into separate containerized workers.
- Multi-tenant role-based access control (RBAC).
- OCR multi-language support for handwritten contracts.

---

## 3. Component Details

### Backend (`apps/backend`)
Follows Domain-Driven Design (DDD) module boundaries:
- `com.legalai.modules.documents`: Upload, POI/PDFBox extraction, PostgreSQL persistence.
- `com.legalai.modules.ai`: Copilot chat orchestration, turn persistence, retrieval.
- `com.legalai.modules.intelligence`: Knowledge graph and timeline endpoints.
- `com.legalai.infrastructure.storage`: Reactive PostgreSQL repository with safe UUID hashing.
- `com.legalai.infrastructure.cache`: Reactive Redis cache with fault-tolerant fallback.
- `com.legalai.infrastructure.websocket`: Real-time WebSocket token streaming handler.

### AI Intelligence Engine (`apps/ai-service`)
- `app/services/intelligence_engine.py`: Single-source of truth for legal domain logic.
  - **No Hardcoding**: Generic legal patterns extract terms across varied contractual drafting styles.
  - **Zero Saturation**: Risk scoring breaks down into 4 distinct pillars (Liability, Termination, Data Privacy, IP) with human-readable rationales.
  - **Accurate OCR**: Text extraction reports `ocrRecommended=false` and `ocrConfidence=0.0` when native digital text is successfully parsed.

---

## 4. Security & Data Isolation
- All document parsing, embedding generation, vector storage, and analysis run **strictly inside the local Docker network**.
- No document text or metadata is transmitted to external cloud LLM providers unless explicitly configured by the user.
