CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS documents (
  document_id UUID PRIMARY KEY,
  file_name TEXT NOT NULL,
  jurisdiction TEXT,
  extraction_method TEXT,
  ocr_recommended BOOLEAN NOT NULL DEFAULT FALSE,
  ocr_confidence DOUBLE PRECISION,
  analysis_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS conversation_messages (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  citations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversation_document_id_created_at
  ON conversation_messages (document_id, created_at);
