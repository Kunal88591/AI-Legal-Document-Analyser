package com.legalai.modules.ai.dto;

public record RetrievalRequest(String documentId, String query, int topK) {}