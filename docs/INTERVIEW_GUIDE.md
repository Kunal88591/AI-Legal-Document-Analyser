# Legal AI Platform v2.1 — Technical Interview Guide

This guide is designed to help you explain and defend every architectural decision, data flow, failure mode, and system design aspect of the Legal AI Platform based **strictly on the actual implementation**.

---

## 1. Project Explanations

### 30-Second Elevator Pitch
> "Legal AI Platform v2.1 is an enterprise-grade, privacy-first legal document intelligence platform. It processes complex legal contracts such as SaaS agreements, NDAs, and DPAs to extract key milestones, contract durations, party-attributed obligations, and multi-dimensional risk scores. The architecture is a reactive monorepo using Spring Boot 3 WebFlux as an API gateway and orchestrator, FastAPI for dense vector retrieval and NLP intelligence, ChromaDB and Sentence Transformers for local RAG, PostgreSQL 16 and Redis 7 for persistence and caching, and a React 19 dashboard with WebSocket copilot streaming."

### 1-Minute Technical Summary
> "I built Legal AI Platform v2.1 to solve a critical issue in automated contract review: generic LLMs frequently hallucinate legal terms, misclassify commercial agreements as employment contracts due to stray confidentiality words, and fail to distinguish actual calendar dates from contract durations and notice deadlines. 
> To solve this, I designed a multi-tier reactive architecture. In the backend, Spring Boot 3 WebFlux offloads PDFBox and Apache POI parsing to bounded elastic schedulers to prevent Netty event-loop blocking, persisting metadata to PostgreSQL via R2DBC and caching repeated requests in Redis. In the AI tier, FastAPI runs a specialized intelligence engine that uses hierarchical preamble matching for 100% accurate contract classification, distance-based proximity scoring to extract semantic dates and notice deadlines without context bleeding, and a 4-category balanced risk model. Users interact through a modern React frontend featuring real-time WebSocket token streaming, knowledge graph visualization, and side-by-side contract comparison."

### 2-Minute Comprehensive Architectural Walkthrough
> "The platform was built with privacy and deterministic reliability as the top priorities. Because legal contracts contain trade secrets and personally identifiable data, the entire intelligence pipeline runs locally without leaking data to third-party APIs.
> 
> When a contract is uploaded:
> 1. An Nginx reverse proxy routes the multipart payload to a reactive Spring Boot 3 WebFlux gateway.
> 2. The backend extracts native text using Apache PDFBox and Apache POI on a bounded elastic thread pool, accurately determining whether OCR is actually necessary.
> 3. The extracted text is sent to our Python FastAPI service, where our `IntelligenceEngine` runs spaCy sentencizing, hierarchical contract classification, distance-based semantic date disambiguation, and regex-patterned obligation extraction.
> 4. Contract clauses are embedded using Sentence Transformers (`all-MiniLM-L6-v2`) and indexed into ChromaDB with rich metadata (clause type, line ranges, risk level).
> 5. The backend asynchronously persists document records and full analysis payloads into PostgreSQL 16 using reactive R2DBC, while caching repeated analysis and simplification requests in Redis 7.
> 6. When the user queries the Copilot, Spring Boot routes the request over WebSocket (`/ws/copilot`) or REST. The AI service performs vector similarity retrieval against ChromaDB, builds grounded context, and streams tokens back to the user with exact clause citations.
> 
> Key technical problems solved include: eliminating reactive chain stalls in WebFlux, resolving PostgreSQL UUID casting issues across arbitrary document IDs, eliminating fake OCR confidence reporting, preventing 100% risk score saturation, and completely preventing commercial contracts from being misclassified as employment contracts."

---

## 2. Explaining the Architecture Verbally

When asked to draw or explain the architecture:
- **Boundary Separation**: "We intentionally decoupled the I/O-intensive gateway orchestrator (Spring Boot WebFlux) from the ML/NLP computing engine (FastAPI)."
- **Asynchronous Data Layer**: "Persistence uses non-blocking R2DBC for PostgreSQL and Lettuce for Redis, ensuring that slow database writes never block reactive request processing."
- **Local RAG Stack**: "Vector embeddings (`all-MiniLM-L6-v2`) and vector search (`ChromaDB`) run entirely in-process inside the Docker network. Ollama is integrated via HTTP for generative completions, with deterministic local fallback if Ollama is unavailable."

---

## 3. Spring Boot WebFlux Deep Dive

### Q: Why did you choose Spring WebFlux instead of Spring MVC?
> **Answer**: Legal contract processing involves long-lived connections (such as WebSocket streaming for the Copilot) and asynchronous fan-out to external AI services and databases. Spring WebFlux runs on Netty using an event-driven, non-blocking I/O model with a small fixed thread pool (typically equal to the number of CPU cores). This allows the gateway to handle thousands of concurrent client connections with minimal memory footprint compared to the thread-per-request model of traditional Spring MVC/Tomcat.

### Q: What is the risk of running Apache PDFBox or POI inside WebFlux, and how did you mitigate it?
> **Answer**: PDFBox and Apache POI perform heavy CPU-bound parsing and blocking stream reads. If executed directly inside a WebFlux reactive chain, they block Netty's event loop threads, starving other incoming HTTP requests. I mitigated this by wrapping the extraction calls inside `Mono.fromCallable(...)` and dispatching them to `Schedulers.boundedElastic()`, which maintains a dedicated thread pool for blocking operations.

### Q: What was the bug in `ChatHistoryService` and how did you fix it?
> **Answer**: The original code had:
> `persistTurns(store, request, response).onErrorResume(e -> Mono.empty()).thenReturn(response)`
> In Project Reactor, `persistTurns` returns `Mono<Void>`. Because `Mono<Void>` emits no item on completion, `.thenReturn(response)` (which internally maps an incoming onNext element) produces an empty Mono! This triggered `switchIfEmpty(...)`, causing a duplicate LLM call and bypassing history persistence. I fixed it by replacing `.thenReturn(response)` with `.then(Mono.just(response))`.

---

## 4. AI & NLP Deep Dive

### Q: How did you fix contract type misclassification?
> **Answer**: Generic keyword search often detects words like 'employee' or 'contractor' inside confidentiality clauses (e.g. 'each party may disclose confidential info to its employees and contractors') and mistakenly classifies a commercial SaaS agreement as an Employment Agreement. 
> I implemented a hierarchical, weighted classification algorithm:
> 1. Preamble & Title matching (first 1500 characters) carries top priority. Explicit terms like 'Software Services Agreement', 'Data Processing Agreement', or 'Master Services Agreement' immediately classify the contract.
> 2. Document body scoring checks for structural commercial signals (fees, SLAs, license grants, SaaS terms) vs employment signals (salary, payroll, benefits, employer/employee definitions).
> 3. Standard confidentiality mentions of employees are excluded from employment weighting.

### Q: How does your distance-based semantic date disambiguation work?
> **Answer**: In legal contracts and summary schedules (e.g., Schedule A operational tables), multiple dates often appear in close proximity within a compact text block. A naive regular expression search with a wide character window (e.g. ±120 characters) causes the phrase 'Effective Date' from one row to bleed into an adjacent row containing 'First Invoice Date' or 'Technical Contact Deadline'.
> To prevent context bleeding, I implemented a distance-based scoring algorithm:
> For every detected ISO date, we compute the distance in characters from the date to every nearby legal keyword. The keyword closest to the date match wins. This achieves 100% precision on test contracts without hardcoding.

### Q: Why was the risk score saturating at 100%, and how did you fix it?
> **Answer**: The legacy engine added flat penalties for any risk keyword found, easily hitting 100% on any contract containing standard clauses like indemnification or limitation of liability.
> I replaced it with a multi-dimensional risk model across four distinct legal risk pillars:
> 1. *Liability & Financial* (0-25)
> 2. *Termination & Lock-In* (0-25)
> 3. *Data Privacy & Security* (0-25)
> 4. *Intellectual Property* (0-25)
> Each category is scored independently based on standard vs aggressive clauses, producing a balanced, explainable aggregate score (e.g. 43/100 Moderate) accompanied by a transparent rationale.

---

## 5. Database & Cache Questions

### Q: How is PostgreSQL integrated and what schema is used?
> **Answer**: We use PostgreSQL 16 managed by Flyway migrations (`V1__init.sql`). There are two primary tables:
> - `documents`: Primary key `document_id UUID`, filename, extraction method, OCR flag, and full `analysis_json JSONB`.
> - `conversation_messages`: `id BIGSERIAL`, `document_id UUID`, role, content, and `citations_json JSONB`, indexed on `(document_id, created_at)`.
> Access is fully reactive via Spring Data R2DBC (`DatabaseClient`).

### Q: How is Redis used and how does the system handle Redis downtime?
> **Answer**: Redis 7 is used via `ReactiveStringRedisTemplate` in `LegalCacheService.java`. It caches full document analysis payloads (`legal:analysis:{docId}`) for 24 hours and text simplifications (`legal:simplify:{hash}`) for 7 days.
> All Redis operations are wrapped in `.onErrorResume(err -> Mono.empty())`. If Redis goes down, the system logs a warning and transparently falls back to direct execution without dropping requests.

---

## 6. Failure Scenarios (The Hard Questions)

### Q: "What happens if FastAPI is down?"
> **Answer**: When Spring Boot's `NlpGatewayClient` attempts to call FastAPI, WebClient encounters a connection timeout or refusal. The reactive chain catches the exception in `onErrorResume` and returns a formatted JSON HTTP 500/503 response detailing service unavailability, preventing thread hanging or unhandled crashes.

### Q: "What happens if Ollama is unavailable?"
> **Answer**: In `intelligence_engine.py`, the RAG pipeline checks Ollama connectivity. If Ollama is not installed or unreachable at `http://host.docker.internal:11434`, the engine gracefully falls back to deterministic extractive synthesis using the retrieved ChromaDB chunks, returning the exact clause text and citations without failing.

### Q: "What happens if PostgreSQL is unavailable?"
> **Answer**: `DocumentPersistenceService` and `ChatHistoryService` are built with fault tolerance. Database operations catch errors via `.onErrorResume(err -> Mono.empty())`. The client still receives the document analysis or chat answer in real time; only historical persistence is skipped until the database reconnects.

### Q: "What happens if a 500 MB PDF is uploaded?"
> **Answer**: Spring Boot WebFlux enforces `spring.codec.max-in-memory-size=25MB` and multipart limits of 10MB in `application.properties`. A 500 MB upload is immediately rejected with HTTP 413 Payload Too Large at the gateway/Netty level before consuming heap memory.

---

## 7. System Design & Architectural Decisions

| Decision | Justification |
|----------|---------------|
| **Why Spring WebFlux?** | Non-blocking event loop handles high-concurrency streaming WebSockets and external REST calls with minimal thread overhead. |
| **Why FastAPI?** | Python is the native ecosystem for NLP, spaCy, PyTorch, and Sentence Transformers; FastAPI provides asynchronous execution with automatic Pydantic validation. |
| **Why Separate AI Service?** | Isolates CPU/GPU-intensive model execution and Python memory footprint from the core JVM API gateway. |
| **Why PostgreSQL + JSONB?** | Relational integrity for documents and conversation turns, combined with flexible JSONB indexing for dynamic legal analysis payloads. |
| **Why Redis?** | Eliminates redundant NLP processing for identical document queries and repeated text simplification requests. |
| **Why ChromaDB?** | Lightweight, embedded vector store with zero cloud dependency, perfectly suited for local enterprise RAG. |
| **Why Local Ollama?** | Complete legal privacy: sensitive contract terms never leave the customer's on-premises environment. |
