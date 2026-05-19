package com.legalai.infrastructure.websocket;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legalai.infrastructure.ai.NlpGatewayClient;
import com.legalai.modules.ai.dto.ChatRequest;
import com.legalai.modules.ai.dto.ChatResponse;
import com.legalai.modules.ai.dto.ChatTurn;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.WebSocketMessage;
import org.springframework.web.reactive.socket.WebSocketSession;
import reactor.core.publisher.Flux;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

@Component
public class LegalChatWebSocketHandler implements WebSocketHandler {

    private final NlpGatewayClient nlpGatewayService;
    private final ObjectMapper objectMapper;

    public LegalChatWebSocketHandler(NlpGatewayClient nlpGatewayService, ObjectMapper objectMapper) {
        this.nlpGatewayService = nlpGatewayService;
        this.objectMapper = objectMapper;
    }

    @Override
    public Mono<Void> handle(WebSocketSession session) {
        return session.receive()
                .map(WebSocketMessage::getPayloadAsText)
                .concatMap(raw -> processMessage(session, raw))
                .as(session::send);
    }

    private Flux<WebSocketMessage> processMessage(WebSocketSession session, String rawPayload) {
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> payload = objectMapper.readValue(rawPayload, Map.class);
            String messageId = stringValue(payload, "messageId", uuidMessageId());
            ChatRequest request = toRequest(payload);
            return nlpGatewayService.chat(request)
                .flatMapMany(response -> streamResponse(session, response, messageId))
                    .onErrorResume(error -> Flux.just(session.textMessage(serialize(Map.of(
                            "type", "error",
                    "messageId", messageId,
                            "message", error.getMessage()
                    )))));
        } catch (Exception error) {
            String messageId = uuidMessageId();
            return Flux.just(session.textMessage(serialize(Map.of(
                    "type", "error",
                "messageId", messageId,
                    "message", error.getMessage()
            ))));
        }
    }

    @SuppressWarnings("unchecked")
    private ChatRequest toRequest(Map<String, Object> payload) {
        Object historyRaw = payload.get("history");
        List<ChatTurn> history = historyRaw instanceof List<?> list
                ? list.stream()
                .map(item -> item instanceof Map<?, ?> map
                        ? new ChatTurn(
                stringValue(map, "role", "user"),
                stringValue(map, "content", ""),
                stringValue(map, "timestamp", Instant.now().toString()))
                        : new ChatTurn("user", String.valueOf(item), Instant.now().toString()))
                .toList()
                : List.of();

        return new ChatRequest(
                stringValue(payload, "documentId", "unknown"),
                stringValue(payload, "message", ""),
                stringValue(payload, "mode", "copilot"),
                stringValue(payload, "jurisdiction", "Global"),
                history
        );
    }

        private Flux<WebSocketMessage> streamResponse(WebSocketSession session, ChatResponse response, String messageId) {
        String answer = response.answer() == null ? "" : response.answer();
        List<String> chunks = answer.isBlank()
                ? List.of("I could not generate a legal response right now.")
                : splitForStreaming(answer);

        Flux<WebSocketMessage> messageFlux = Flux.fromIterable(chunks)
                .delayElements(Duration.ofMillis(24))
                .map(chunk -> session.textMessage(serialize(Map.of(
                        "type", "chunk",
                "messageId", messageId,
                        "documentId", response.documentId(),
                        "chunk", chunk,
                        "done", false,
                        "citations", response.citations(),
                        "timestamp", Instant.now().toString()
                ))));

        WebSocketMessage doneMessage = session.textMessage(serialize(Map.of(
                "type", "done",
            "messageId", messageId,
                "documentId", response.documentId(),
                "done", true,
                "citations", response.citations(),
                "timestamp", Instant.now().toString()
        )));

        return messageFlux.concatWithValues(doneMessage);
    }

    private List<String> splitForStreaming(String text) {
        return java.util.Arrays.stream(text.split("(?<=\\s)|(?=\\s)"))
                .filter(token -> !token.isBlank() || token.equals(" "))
                .toList();
    }

    private String serialize(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (Exception error) {
            return "{\"type\":\"error\",\"message\":\"Streaming serialization failed\"}";
        }
    }

    private String stringValue(Map<?, ?> payload, String key, String fallback) {
        Object value = payload.get(key);
        return value == null ? fallback : value.toString();
    }

    private String uuidMessageId() {
        return java.util.UUID.randomUUID().toString();
    }
}