package com.legalai.modules.ai.dto;

import java.util.List;

public record ChatResponse(
        String documentId,
        String answer,
        List<Citation> citations,
        List<ChatTurn> history,
        boolean streamingReady
) {}