package com.legalai.modules.documents.api;

import com.legalai.infrastructure.ai.NlpGatewayClient;
import com.legalai.modules.documents.dto.AnalysisResponse;
import com.legalai.modules.documents.dto.ComparisonResponse;
import com.legalai.modules.documents.service.DocumentExtractionService;
import org.springframework.web.bind.annotation.*;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.core.io.buffer.DataBufferUtils;
import reactor.core.publisher.Mono;

import java.util.Map;
import java.util.UUID;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final DocumentExtractionService extractionService;
        private final NlpGatewayClient nlpGatewayService;

    public DocumentController(DocumentExtractionService extractionService,
                                                          NlpGatewayClient nlpGatewayService) {
        this.extractionService = extractionService;
        this.nlpGatewayService = nlpGatewayService;
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
                try {
                    String documentId = UUID.randomUUID().toString();
                    var extracted = extractionService.extract(file.filename(), bytes);
                    return nlpGatewayService.analyzeDocument(
                                    documentId,
                                    file.filename(),
                                    jurisdiction,
                                    extracted.text(),
                                    bytes,
                                    extracted.ocrRecommended(),
                                    extracted.extractionMethod()
                            )
                            .map(analysis -> ResponseEntity.ok(
                                    (Object) new AnalysisResponse(
                                            documentId,
                                            file.filename(),
                                            extracted.extractionMethod(),
                                            extracted.ocrRecommended(),
                                            extracted.ocrConfidence(),
                                            extracted.warnings(),
                                            analysis
                                    )
                            ));
                } catch (IllegalArgumentException e) {
                    return Mono.just(ResponseEntity.badRequest().body(Map.of("message", e.getMessage())));
                } catch (Exception e) {
                    return Mono.just(ResponseEntity.internalServerError().body(Map.of(
                            "message", "Document analysis failed",
                            "detail", e.getMessage()
                    )));
                }
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

                            var oldExtracted = extractionService.extract(oldFile.filename(), oldBytes);
                            var newExtracted = extractionService.extract(newFile.filename(), newBytes);
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
                        }));
    }
    
    @PostMapping(value = "/simplify", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<Object>> simplifyText(@RequestBody Map<String, String> payload) {
        String text = payload.getOrDefault("text", "");
        return nlpGatewayService.simplifyText(text)
                .map(result -> ResponseEntity.ok((Object) result))
                .onErrorResume(e -> Mono.just(ResponseEntity.internalServerError().body(Map.of(
                        "message", "Simplification failed",
                        "detail", e.getMessage()
                ))));
    }
}
