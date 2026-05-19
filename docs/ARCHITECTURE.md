# Legal AI Platform — Architecture

This repository is structured as an enterprise monorepo with clear separation between deployable applications (`apps/`), shared packages (`packages/`), and infrastructure (`infrastructure/`).

## Monorepo Layout

```
apps/
  backend/      # Spring Boot 3 (WebFlux) API gateway + websocket streaming
  frontend/     # React 19 + Vite dashboard
  ai-service/   # FastAPI AI engine (RAG/OCR/comparison/timeline)

packages/
  shared-types/ # reserved: shared DTO contracts (future)
  shared-ui/    # reserved: reusable UI primitives (future)
  shared-config/# reserved: shared lint/build config (future)

infrastructure/
  nginx/        # edge reverse-proxy (prod-style local compose)

docs/
  ARCHITECTURE.md
  MIGRATION.md
```

## Runtime Topology (Docker Compose)

- `gateway` (nginx): routes `/{ui}` → frontend, `/api/*` → backend, `/ws/*` → backend websocket
- `backend` (Spring WebFlux): document ingestion/extraction, API orchestration, websocket streaming
- `nlp-service` (FastAPI): contract intelligence engine (local-first OSS models)

## Backend (Spring) Structure

Backend code follows a module-oriented layout (DDD-inspired):

- `com.legalai.modules.documents`: upload + extraction + analysis orchestration
- `com.legalai.modules.ai`: copilot chat, retrieval, chat history
- `com.legalai.modules.intelligence`: timeline + graph endpoints
- `com.legalai.infrastructure.*`: external I/O (AI gateway client, websocket)
- `com.legalai.common.*`: shared concerns (exceptions, response patterns)

This keeps feature logic cohesive and makes future microservice extraction easier.

## AI Service (FastAPI) Structure

AI engine is now served via FastAPI under `apps/ai-service/app/`.

- `app/main.py`: service entrypoint
- `app/api/routes/legacy.py`: API compatibility routes (keeps existing backend contract)
- `app/services/intelligence_engine.py`: local-first analysis engine (RAG/OCR/comparison)

The next iteration is to split the large engine into `rag/`, `ocr/`, `comparison/`, etc.

## Frontend Structure

Frontend is Vite-based and feature-driven:

- `src/app/*`: router, providers, layouts, store
- `src/features/*`: business features (dashboard, upload, chat, comparison, timeline, graph)
- `src/shared/*`: reusable components and services (API client, UI components)

## API Contracts

Today the UI and backend communicate with JSON payloads and multipart uploads. The next planned step is extracting shared schemas into `packages/shared-types` (Zod + generated types) to keep contracts consistent across apps.
