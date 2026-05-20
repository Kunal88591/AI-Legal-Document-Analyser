package com.legalai.modules.ai.service;

import com.legalai.modules.ai.dto.Citation;
import com.legalai.modules.ai.dto.ChatTurn;
import reactor.core.publisher.Mono;

import java.util.List;

public interface ChatHistoryStore {
    Mono<Void> appendMessage(String documentId, String role, String content, List<Citation> citations);
    Mono<List<ChatTurn>> getHistory(String documentId, int limit);
}

