package com.legalai.modules.ai.dto;

import java.util.List;

public record ChatRequest(
        String documentId,
        String message,
        String mode,
        String jurisdiction,
        List<ChatTurn> history
) {}