package com.legalai.modules.ai.service;

import com.legalai.modules.ai.dto.Citation;
import com.legalai.modules.ai.dto.ChatTurn;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Component
@Order(Ordered.LOWEST_PRECEDENCE)
public class InMemoryChatHistoryStore implements ChatHistoryStore {

    private final Map<String, Deque<ChatTurn>> store = new ConcurrentHashMap<>();

    @Override
    public Mono<Void> appendMessage(String documentId, String role, String content, List<Citation> citations) {
        if (documentId == null || documentId.isBlank()) {
            return Mono.empty();
        }
        ChatTurn turn = new ChatTurn(role == null ? "assistant" : role, content == null ? "" : content, Instant.now().toString());
        store.computeIfAbsent(documentId, key -> new ArrayDeque<>()).addLast(turn);
        return Mono.empty();
    }

    @Override
    public Mono<List<ChatTurn>> getHistory(String documentId, int limit) {
        Deque<ChatTurn> deque = store.getOrDefault(documentId, new ArrayDeque<>());
        int effectiveLimit = Math.max(1, limit);
        List<ChatTurn> results = new ArrayList<>(Math.min(effectiveLimit, deque.size()));
        int skip = Math.max(0, deque.size() - effectiveLimit);
        int index = 0;
        for (ChatTurn turn : deque) {
            if (index++ >= skip) {
                results.add(turn);
            }
        }
        return Mono.just(results);
    }
}
