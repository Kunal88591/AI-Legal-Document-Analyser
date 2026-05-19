package com.legalai.modules.ai.dto;

import java.util.List;

public record HistoryResponse(String documentId, List<ChatTurn> turns) {}