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

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

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

    private UUID safeUuid(String documentId) {
        if (documentId == null || documentId.isBlank()) {
            return UUID.randomUUID();
        }
        try {
            return UUID.fromString(documentId.trim());
        } catch (IllegalArgumentException e) {
            return UUID.nameUUIDFromBytes(documentId.trim().getBytes(StandardCharsets.UTF_8));
        }
    }

    @Override
    public Mono<Void> appendMessage(String documentId, String role, String content, List<Citation> citations) {
        UUID docUuid = safeUuid(documentId);
        return databaseClient.sql(
                "INSERT INTO conversation_messages (document_id, role, content, citations_json) " +
                    "VALUES (:documentId, :role, :content, :citations::jsonb)"
                )
            .bind("documentId", docUuid)
            .bind("role", role == null ? "assistant" : role)
            .bind("content", content == null ? "" : content)
            .bind("citations", toJson(citations))
                .then();
    }

    @Override
    public Mono<List<ChatTurn>> getHistory(String documentId, int limit) {
        UUID docUuid = safeUuid(documentId);
        int effectiveLimit = Math.max(1, limit);
        return databaseClient.sql(
                "SELECT role, content, created_at FROM conversation_messages " +
                    "WHERE document_id = :documentId ORDER BY created_at ASC LIMIT :limit"
                )
            .bind("documentId", docUuid)
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
