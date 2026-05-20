import { z } from 'zod';

export const CitationSchema = z
  .object({
    clauseId: z.string().default('citation-1'),
    label: z.string().default('Clause'),
    lineStart: z.number().int().nonnegative().default(0),
    lineEnd: z.number().int().nonnegative().default(0),
    excerpt: z.string().default(''),
  })
  .passthrough();

export const ChatTurnSchema = z
  .object({
    role: z.string().default('assistant'),
    content: z.string().default(''),
    timestamp: z.string().optional().default(''),
    citations: z.array(CitationSchema).optional().default([]),
  })
  .passthrough();

export const AnalysisResponseSchema = z
  .object({
    documentId: z.string(),
    fileName: z.string(),
    extractionMethod: z.string().optional().default('unknown'),
    ocrRecommended: z.boolean().optional().default(false),
    ocrConfidence: z.number().optional().default(0),
    warnings: z.array(z.string()).optional().default([]),
    analysis: z.record(z.any()).optional().default({}),
  })
  .passthrough();

export const ComparisonResponseSchema = z
  .object({
    comparisonId: z.string(),
    oldFileName: z.string(),
    newFileName: z.string(),
    result: z.record(z.any()).optional().default({}),
  })
  .passthrough();

export const ChatRequestSchema = z
  .object({
    documentId: z.string(),
    message: z.string(),
    mode: z.string().optional().default('copilot'),
    jurisdiction: z.string().optional().default('Global'),
    history: z.array(ChatTurnSchema).optional().default([]),
  })
  .passthrough();

export const ChatResponseSchema = z
  .object({
    documentId: z.string(),
    answer: z.string(),
    citations: z.array(CitationSchema).optional().default([]),
    history: z.array(ChatTurnSchema).optional().default([]),
    streamingReady: z.boolean().optional().default(false),
  })
  .passthrough();

export const HistoryResponseSchema = z
  .object({
    documentId: z.string(),
    turns: z.array(ChatTurnSchema).optional().default([]),
  })
  .passthrough();

export const GraphResponseSchema = z
  .object({
    documentId: z.string(),
    nodes: z.array(z.record(z.any())).optional().default([]),
    edges: z.array(z.record(z.any())).optional().default([]),
    warnings: z.array(z.string()).optional().default([]),
  })
  .passthrough();

export const TimelineResponseSchema = z
  .object({
    documentId: z.string(),
    events: z.array(z.record(z.any())).optional().default([]),
    obligations: z.array(z.record(z.any())).optional().default([]),
    upcomingCount: z.number().int().optional().default(0),
    urgentCount: z.number().int().optional().default(0),
  })
  .passthrough();

export function parseWith(schema, value, name = 'response') {
  const result = schema.safeParse(value);
  if (!result.success) {
    const message = result.error.issues?.[0]?.message || `Invalid ${name}`;
    const error = new Error(message);
    error.name = 'ContractValidationError';
    error.cause = result.error;
    throw error;
  }
  return result.data;
}
