# Migration Guide

This repo is being upgraded from a “single-repo demo layout” into a production-grade monorepo.

## Phase 1 (Completed)

- Move services into `apps/`.
- Add `infrastructure/nginx` gateway reverse proxy.
- Upgrade AI service runtime to FastAPI.
- Migrate frontend to Vite and introduce feature-driven structure.
- Refactor backend package layout under `com.legalai`.

## Phase 2 (Next)

### Shared types

- Define request/response contracts (Zod) in `packages/shared-types`.
- Use the same schemas in:
  - frontend API layer (decode/validate responses)
  - backend DTO mapping (contract tests)

### Backend hardening

- Add `spring-boot-starter-security` with JWT-ready config (permit-all in dev).
- Add rate limiting middleware (e.g., Redis token bucket) behind feature flags.
- Add structured JSON logging + correlation IDs.
- Add persistence layer (PostgreSQL) and caching (Redis).

### AI service modularization

- Split `intelligence_engine.py` into `services/rag`, `services/ocr`, `services/comparison`, etc.
- Add async background processing hooks (queue-ready) for:
  - OCR jobs
  - embedding/indexing
  - long summarizations

### Deployment

- Add prod compose file with:
  - postgres
  - redis
  - healthchecks + restart policies
  - resource limits
