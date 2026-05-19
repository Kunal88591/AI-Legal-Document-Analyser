package com.legalai.infrastructure.ai;

import com.legalai.modules.ai.dto.ChatRequest;
import com.legalai.modules.ai.dto.ChatResponse;
import com.legalai.modules.ai.dto.ChatTurn;
import com.legalai.modules.ai.dto.HistoryResponse;
import com.legalai.modules.ai.dto.RetrievalRequest;
import com.legalai.modules.intelligence.dto.GraphResponse;
import com.legalai.modules.intelligence.dto.TimelineResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.http.MediaType;
import org.springframework.http.client.MultipartBodyBuilder;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.BodyInserters;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
public class NlpGatewayClient {

    private final WebClient webClient;

    public NlpGatewayClient(WebClient.Builder webClientBuilder,
                             @Value("${legal.intelligence.nlp-service-url:http://localhost:5000}") String nlpServiceUrl) {
        this.webClient = webClientBuilder.baseUrl(nlpServiceUrl).build();
    }

    public Mono<Map<String, Object>> analyzeDocument(String documentId,
                                                     String fileName,
                                                     String jurisdiction,
                                                     String text,
                                                     byte[] bytes,
                                                     boolean ocrRecommended,
                                                     String extractionMethod) {
        MultipartBodyBuilder builder = new MultipartBodyBuilder();
        builder.part("documentId", documentId);
        builder.part("fileName", fileName);
        builder.part("jurisdiction", jurisdiction == null || jurisdiction.isBlank() ? "Global" : jurisdiction);
        builder.part("text", text == null ? "" : text);
        builder.part("ocrRecommended", String.valueOf(ocrRecommended));
        builder.part("extractionMethod", extractionMethod);
        if (bytes != null && bytes.length > 0) {
            builder.part("file", new ByteArrayResource(bytes) {
                @Override
                public String getFilename() {
                    return fileName;
                }
            }).contentType(MediaType.APPLICATION_OCTET_STREAM);
        }

        return webClient.post()
                .uri("/api/analyze-document")
                .contentType(MediaType.MULTIPART_FORM_DATA)
                .body(BodyInserters.fromMultipartData(builder.build()))
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .timeout(Duration.ofSeconds(120));
    }

    public Mono<Map<String, Object>> compareDocuments(String oldFileName,
                                                      String newFileName,
                                                      String oldText,
                                                      String newText,
                                                      String jurisdiction) {
        Map<String, Object> payload = new HashMap<>();
        payload.put("oldFileName", oldFileName);
        payload.put("newFileName", newFileName);
        payload.put("oldText", oldText);
        payload.put("newText", newText);
        payload.put("jurisdiction", jurisdiction == null || jurisdiction.isBlank() ? "Global" : jurisdiction);

        return webClient.post()
                .uri("/api/compare-contracts")
                .bodyValue(payload)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .timeout(Duration.ofSeconds(120));
    }

    public Mono<ChatResponse> chat(ChatRequest request) {
        return webClient.post()
                .uri("/api/copilot/chat")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .timeout(Duration.ofSeconds(90))
                .map(payload -> new ChatResponse(
                        stringValue(payload, "documentId", request.documentId()),
                        stringValue(payload, "answer", "I could not generate a response."),
                        CitationMapper.toCitations(payload.get("citations")),
                        request.history() == null ? List.of() : request.history(),
                        true
                ));
    }

    public Mono<Object> retrieve(RetrievalRequest request) {
        return webClient.post()
                .uri("/api/copilot/retrieve")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .timeout(Duration.ofSeconds(60))
                .cast(Object.class);
    }

    public Mono<HistoryResponse> history(String documentId) {
        return webClient.get()
                .uri(uriBuilder -> uriBuilder.path("/api/copilot/history/{documentId}").build(documentId))
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .timeout(Duration.ofSeconds(30))
                .map(payload -> new HistoryResponse(documentId, ChatTurnMapper.toTurns(payload.get("turns"))));
    }

    public Mono<GraphResponse> graph(String documentId) {
        return webClient.get()
                .uri(uriBuilder -> uriBuilder.path("/api/intelligence/graph/{documentId}").build(documentId))
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .timeout(Duration.ofSeconds(45))
                .map(payload -> new GraphResponse(
                        documentId,
                        ListMapper.toListOfMaps(payload.get("nodes")),
                        ListMapper.toListOfMaps(payload.get("edges")),
                        ListMapper.toStrings(payload.get("warnings"))
                ));
    }

    public Mono<TimelineResponse> timeline(String documentId) {
        return webClient.get()
                .uri(uriBuilder -> uriBuilder.path("/api/intelligence/timeline/{documentId}").build(documentId))
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .timeout(Duration.ofSeconds(45))
                .map(payload -> new TimelineResponse(
                        documentId,
                        ListMapper.toListOfMaps(payload.get("events")),
                        ListMapper.toListOfMaps(payload.get("obligations")),
                        intValue(payload, "upcomingCount", 0),
                        intValue(payload, "urgentCount", 0)
                ));
    }

    public Mono<Map<String, Object>> simplifyText(String text) {
        return webClient.post()
                .uri("/simplify")
                .bodyValue(Map.of("text", text == null ? "" : text))
                .retrieve()
                .bodyToMono(new ParameterizedTypeReference<Map<String, Object>>() {})
                .timeout(Duration.ofSeconds(30));
    }

    private static String stringValue(Map<String, Object> payload, String key, String fallback) {
        Object value = payload.get(key);
        return value == null ? fallback : value.toString();
    }

    private static int intValue(Map<String, Object> payload, String key, int fallback) {
        Object value = payload.get(key);
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value == null) {
            return fallback;
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException ignored) {
            return fallback;
        }
    }

    private static final class CitationMapper {
        private CitationMapper() {
        }

        private static List<com.legalai.modules.ai.dto.Citation> toCitations(Object raw) {
            return ListMapper.toListOfMaps(raw).stream()
                    .map(item -> new com.legalai.modules.ai.dto.Citation(
                            stringValue(item, "clauseId", "citation-1"),
                            stringValue(item, "label", "Clause"),
                            intValue(item, "lineStart", 0),
                            intValue(item, "lineEnd", 0),
                            stringValue(item, "excerpt", "")
                    ))
                    .toList();
        }
    }

    private static final class ChatTurnMapper {
        private ChatTurnMapper() {
        }

        private static List<ChatTurn> toTurns(Object raw) {
            return ListMapper.toListOfMaps(raw).stream()
                    .map(item -> new ChatTurn(
                            stringValue(item, "role", "assistant"),
                            stringValue(item, "content", ""),
                            stringValue(item, "timestamp", "")
                    ))
                    .toList();
        }
    }

    private static final class ListMapper {
        private ListMapper() {
        }

        private static List<Map<String, Object>> toListOfMaps(Object raw) {
            if (raw instanceof List<?> list) {
                return list.stream()
                        .map(item -> item instanceof Map<?, ?> map ? toStringKeyMap(map) : Map.<String, Object>of())
                        .toList();
            }
            return List.of();
        }

        private static List<String> toStrings(Object raw) {
            if (raw instanceof List<?> list) {
                return list.stream().map(String::valueOf).toList();
            }
            return List.of();
        }

        private static Map<String, Object> toStringKeyMap(Map<?, ?> raw) {
            Map<String, Object> converted = new HashMap<>();
            raw.forEach((key, value) -> converted.put(String.valueOf(key), value));
            return converted;
        }
    }
}