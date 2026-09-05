package com.legalai.modules.ai.service;

import com.legalai.infrastructure.ai.NlpGatewayClient;
import com.legalai.modules.ai.dto.Citation;
import com.legalai.modules.ai.dto.ChatRequest;
import com.legalai.modules.ai.dto.ChatResponse;
import com.legalai.modules.ai.dto.ChatTurn;
import com.legalai.modules.ai.dto.HistoryResponse;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.util.List;

@Service
public class ChatHistoryService {

    private final NlpGatewayClient nlpGatewayClient;
    private final List<PersistentChatHistoryStore> persistentStores;

    public ChatHistoryService(NlpGatewayClient nlpGatewayClient, List<PersistentChatHistoryStore> persistentStores) {
        this.nlpGatewayClient = nlpGatewayClient;
    this.persistentStores = persistentStores;
    }

    public Mono<ChatResponse> chatAndPersist(ChatRequest request) {
        return persistentStore()
            .flatMap(store -> nlpGatewayClient.chat(request)
                .flatMap(response -> persistTurns(store, request, response)
                    .onErrorResume(error -> Mono.empty())
                    .then(Mono.just(response))))
            .switchIfEmpty(nlpGatewayClient.chat(request));
    }

    public Mono<HistoryResponse> history(String documentId) {
    return persistentStore()
        .flatMap(store -> store.getHistory(documentId, 50)
            .map(turns -> new HistoryResponse(documentId, turns)))
        .switchIfEmpty(nlpGatewayClient.history(documentId))
        .onErrorResume(error -> nlpGatewayClient.history(documentId));
    }

    private Mono<Void> persistTurns(ChatHistoryStore store, ChatRequest request, ChatResponse response) {
        String documentId = response.documentId() == null || response.documentId().isBlank()
                ? request.documentId()
                : response.documentId();

        if (documentId == null || documentId.isBlank()) {
            return Mono.empty();
        }

        String userMessage = request.message() == null ? "" : request.message();
        String assistantMessage = response.answer() == null ? "" : response.answer();
        List<Citation> citations = response.citations() == null ? List.of() : response.citations();

        return store.appendMessage(documentId, "user", userMessage, List.of())
                .then(store.appendMessage(documentId, "assistant", assistantMessage, citations));
    }

    private Mono<PersistentChatHistoryStore> persistentStore() {
        return Mono.justOrEmpty(persistentStores.stream().findFirst());
    }
}
