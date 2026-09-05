package com.legalai.modules.documents.api;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.legalai.infrastructure.ai.NlpGatewayClient;
import com.legalai.infrastructure.cache.LegalCacheService;
import com.legalai.modules.documents.dto.AnalysisResponse;
import com.legalai.modules.documents.dto.ComparisonResponse;
import com.legalai.modules.documents.service.DocumentExtractionService;
import com.legalai.modules.documents.service.DocumentPersistenceService;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.core.io.buffer.DataBufferUtils;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.util.Map;
import java.util.UUID;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentExtractionService extractionService;
    private final NlpGatewayClient nlpGatewayService;
    private final DocumentPersistenceService persistenceService;
    private final LegalCacheService cacheService;
    private final ObjectMapper objectMapper;

    public DocumentController(
            DocumentExtractionService extractionService,
            NlpGatewayClient nlpGatewayService,
            DocumentPersistenceService persistenceService,
            LegalCacheService cacheService,
            ObjectMapper objectMapper
    ) {
        this.extractionService = extractionService;
        this.nlpGatewayService = nlpGatewayService;
        this.persistenceService = persistenceService;
        this.cacheService = cacheService;
        this.objectMapper = objectMapper;
    }

    @PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<Object>> uploadDocument(
            @RequestPart("file") FilePart file,
            @RequestPart(value = "jurisdiction", required = false) String jurisdiction
    ) {
        return DataBufferUtils.join(file.content())
            .flatMap(dataBuffer -> {
                byte[] bytes = new byte[dataBuffer.readableByteCount()];
                dataBuffer.read(bytes);
                DataBufferUtils.release(dataBuffer);
                String documentId = UUID.randomUUID().toString();

                return Mono.fromCallable(() -> extractionService.extract(file.filename(), bytes))
                        .subscribeOn(Schedulers.boundedElastic())
                        .flatMap(extracted -> nlpGatewayService.analyzeDocument(
                                        documentId,
                                        file.filename(),
                                        jurisdiction,
                                        extracted.text(),
                                        bytes,
                                        extracted.ocrRecommended(),
                                        extracted.extractionMethod()
                                )
                                .flatMap(analysis -> {
                                    var response = new AnalysisResponse(
                                            documentId,
                                            file.filename(),
                                            extracted.extractionMethod(),
                                            extracted.ocrRecommended(),
                                            extracted.ocrConfidence(),
                                            extracted.warnings(),
                                            analysis
                                    );
                                    return persistenceService.saveDocument(
                                            documentId,
                                            file.filename(),
                                            jurisdiction,
                                            extracted.extractionMethod(),
                                            extracted.ocrRecommended(),
                                            extracted.ocrConfidence(),
                                            analysis
                                    ).then(Mono.just(ResponseEntity.ok((Object) response)));
                                }))
                        .onErrorResume(IllegalArgumentException.class, e ->
                                Mono.just(ResponseEntity.badRequest().body(Map.of("message", e.getMessage()))))
                        .onErrorResume(e ->
                                Mono.just(ResponseEntity.internalServerError().body(Map.of(
                                        "message", "Document analysis failed",
                                        "detail", e.getMessage() == null ? "Unknown error" : e.getMessage()
                                ))));
            });
    }

    @PostMapping(value = "/compare", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<Object>> compareDocuments(
            @RequestPart("oldFile") FilePart oldFile,
            @RequestPart("newFile") FilePart newFile,
            @RequestPart(value = "jurisdiction", required = false) String jurisdiction
    ) {
        return DataBufferUtils.join(oldFile.content())
                .flatMap(oldBuffer -> DataBufferUtils.join(newFile.content())
                        .flatMap(newBuffer -> {
                            byte[] oldBytes = new byte[oldBuffer.readableByteCount()];
                            oldBuffer.read(oldBytes);
                            byte[] newBytes = new byte[newBuffer.readableByteCount()];
                            newBuffer.read(newBytes);
                            DataBufferUtils.release(oldBuffer);
                            DataBufferUtils.release(newBuffer);

                            return Mono.zip(
                                    Mono.fromCallable(() -> extractionService.extract(oldFile.filename(), oldBytes))
                                            .subscribeOn(Schedulers.boundedElastic()),
                                    Mono.fromCallable(() -> extractionService.extract(newFile.filename(), newBytes))
                                            .subscribeOn(Schedulers.boundedElastic())
                            ).flatMap(tuple -> {
                                var oldExtracted = tuple.getT1();
                                var newExtracted = tuple.getT2();
                                return nlpGatewayService.compareDocuments(
                                                oldFile.filename(),
                                                newFile.filename(),
                                                oldExtracted.text(),
                                                newExtracted.text(),
                                                jurisdiction
                                        )
                                        .map(compare -> ResponseEntity.ok(
                                                (Object) new ComparisonResponse(
                                                        UUID.randomUUID().toString(),
                                                        oldFile.filename(),
                                                        newFile.filename(),
                                                        compare
                                                )
                                        ));
                            });
                        }));
    }
    
    @PostMapping(value = "/simplify", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<Object>> simplifyText(@RequestBody Map<String, String> payload) {
        String text = payload.getOrDefault("text", "");
        String cacheKey = Integer.toHexString(text.hashCode());

        return cacheService.getCachedSimplification(cacheKey)
                .flatMap(cachedJson -> {
                    try {
                        Object parsed = objectMapper.readValue(cachedJson, Object.class);
                        return Mono.just(ResponseEntity.ok(parsed));
                    } catch (Exception e) {
                        return Mono.empty();
                    }
                })
                .switchIfEmpty(nlpGatewayService.simplifyText(text)
                        .flatMap(result -> {
                            try {
                                String json = objectMapper.writeValueAsString(result);
                                return cacheService.cacheSimplification(cacheKey, json)
                                        .thenReturn(ResponseEntity.ok((Object) result));
                            } catch (Exception e) {
                                return Mono.just(ResponseEntity.ok((Object) result));
                            }
                        }))
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                        "message", "Simplification failed",
                        "detail", e.getMessage() == null ? "Unknown error" : e.getMessage()
                ))));
    }
}
