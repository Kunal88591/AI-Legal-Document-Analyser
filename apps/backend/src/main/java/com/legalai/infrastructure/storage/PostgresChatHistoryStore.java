package com.legalai.infrastructure.storage;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legalai.modules.ai.dto.Citation;
import com.legalai.modules.ai.dto.ChatTurn;
import com.legalai.modules.ai.service.ChatHistoryStore;
import com.legalai.modules.ai.service.PersistentChatHistoryStore;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import reactor.core.publisher.Mono;

import java.time.Instant;
import java.util.List;

@Component
@ConditionalOnExpression("'${spring.r2dbc.url:}'.length() > 0")
@Order(0)
public class PostgresChatHistoryStore implements PersistentChatHistoryStore {

    private final DatabaseClient databaseClient;
    private final ObjectMapper objectMapper;

    public PostgresChatHistoryStore(DatabaseClient databaseClient, ObjectMapper objectMapper) {
        this.databaseClient = databaseClient;
        this.objectMapper = objectMapper;
    }

    @Override
    public Mono<Void> appendMessage(String documentId, String role, String content, List<Citation> citations) {
        return databaseClient.sql(
                "INSERT INTO conversation_messages (document_id, role, content, citations_json) " +
                    "VALUES (:documentId::uuid, :role, :content, :citations::jsonb)"
                )
            .bind("documentId", documentId)
            .bind("role", role == null ? "assistant" : role)
            .bind("content", content == null ? "" : content)
            .bind("citations", toJson(citations))
                .then();
    }

    @Override
    public Mono<List<ChatTurn>> getHistory(String documentId, int limit) {
        int effectiveLimit = Math.max(1, limit);
        return databaseClient.sql(
                "SELECT role, content, created_at FROM conversation_messages " +
                    "WHERE document_id = :documentId::uuid ORDER BY created_at ASC LIMIT :limit"
                )
            .bind("documentId", documentId)
            .bind("limit", effectiveLimit)
                .map((row, metadata) -> new ChatTurn(
                        row.get("role", String.class),
                        row.get("content", String.class),
                        asIso(row.get("created_at"))
                ))
                .all()
                .collectList();
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? List.of() : value);
        } catch (JsonProcessingException ignored) {
            return "[]";
        }
    }

    private String asIso(Object createdAt) {
        if (createdAt == null) {
            return Instant.now().toString();
        }
        return createdAt.toString();
    }
}
