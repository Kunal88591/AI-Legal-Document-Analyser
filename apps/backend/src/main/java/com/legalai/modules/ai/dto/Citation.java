package com.legalai.modules.ai.dto;

public record Citation(String clauseId, String label, int lineStart, int lineEnd, String excerpt) {}