package com.legalai.modules.documents.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.r2dbc.core.DatabaseClient;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

@Service
public class DocumentPersistenceService {

    private static final Logger log = LoggerFactory.getLogger(DocumentPersistenceService.class);

    private final DatabaseClient databaseClient;
    private final ObjectMapper objectMapper;

    public DocumentPersistenceService(ObjectProvider<DatabaseClient> databaseClientProvider,
                                      ObjectMapper objectMapper) {
        this.databaseClient = databaseClientProvider.getIfAvailable();
        this.objectMapper = objectMapper;
        if (this.databaseClient != null) {
            log.info("PostgreSQL document persistence initialized.");
        } else {
            log.warn("PostgreSQL database client not available; running without R2DBC document persistence.");
        }
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

    public Mono<Void> saveDocument(
            String documentId,
            String fileName,
            String jurisdiction,
            String extractionMethod,
            boolean ocrRecommended,
            double ocrConfidence,
            Object analysis
    ) {
        if (databaseClient == null) {
            return Mono.empty();
        }

        UUID docUuid = safeUuid(documentId);
        String analysisJson = toJson(analysis);

        return databaseClient.sql(
                "INSERT INTO documents (document_id, file_name, jurisdiction, extraction_method, ocr_recommended, ocr_confidence, analysis_json) " +
                "VALUES (:documentId, :fileName, :jurisdiction, :extractionMethod, :ocrRecommended, :ocrConfidence, :analysisJson::jsonb) " +
                "ON CONFLICT (document_id) DO UPDATE SET " +
                "  file_name = EXCLUDED.file_name, " +
                "  jurisdiction = EXCLUDED.jurisdiction, " +
                "  extraction_method = EXCLUDED.extraction_method, " +
                "  ocr_recommended = EXCLUDED.ocr_recommended, " +
                "  ocr_confidence = EXCLUDED.ocr_confidence, " +
                "  analysis_json = EXCLUDED.analysis_json, " +
                "  updated_at = NOW()"
        )
        .bind("documentId", docUuid)
        .bind("fileName", fileName == null ? "document" : fileName)
        .bind("jurisdiction", jurisdiction == null ? "General" : jurisdiction)
        .bind("extractionMethod", extractionMethod == null ? "direct" : extractionMethod)
        .bind("ocrRecommended", ocrRecommended)
        .bind("ocrConfidence", ocrConfidence)
        .bind("analysisJson", analysisJson)
        .then()
        .doOnSuccess(v -> log.info("Successfully persisted document {} to PostgreSQL", docUuid))
        .onErrorResume(err -> {
            log.warn("Failed to persist document {} to PostgreSQL: {}", docUuid, err.getMessage());
            return Mono.empty();
        });
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value == null ? "{}" : value);
        } catch (JsonProcessingException e) {
            return "{}";
        }
    }
}
