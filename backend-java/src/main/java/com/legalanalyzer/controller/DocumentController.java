package com.legalanalyzer.controller;

import org.springframework.web.bind.annotation.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.core.io.buffer.DataBufferUtils;
import reactor.core.publisher.Mono;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.pdfbox.Loader;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.util.StringUtils;
import org.springframework.http.HttpStatus;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.Map;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/documents")
public class DocumentController {

    private final WebClient webClient;

    @Autowired
    public DocumentController(WebClient.Builder webClientBuilder,
                             @Value("${nlp.service.url:http://localhost:5000}") String nlpServiceUrl) {
        this.webClient = webClientBuilder.baseUrl(nlpServiceUrl).build();
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
                    String text = extractText(file.filename(), bytes);
                    return webClient.post()
                        .uri("/analyze")
                        .bodyValue(new TextRequest(text, jurisdiction))
                        .retrieve()
                        .bodyToMono(Object.class)
                        .map(ResponseEntity::ok)
                        .onErrorResume(e -> Mono.just(
                            ResponseEntity.internalServerError()
                                .body(Map.of("message", "Analysis failed: " + e.getMessage()))
                        ));
                } catch (IllegalArgumentException e) {
                    return Mono.just(
                        ResponseEntity.status(HttpStatus.BAD_REQUEST).body(Map.of("message", e.getMessage()))
                    );
                } catch (Exception e) {
                    return Mono.just(
                        ResponseEntity.internalServerError()
                            .body(Map.of("message", "PDF processing error: " + e.getMessage()))
                    );
                }
            });
    }
    
    @PostMapping(value = "/simplify", consumes = MediaType.APPLICATION_JSON_VALUE)
    public Mono<ResponseEntity<Object>> simplifyText(@RequestBody Map<String, String> payload) {
        String text = payload.getOrDefault("text", "");
        return webClient.post()
                .uri("/simplify")
                .bodyValue(Map.of("text", text))
                .retrieve()
                .bodyToMono(Object.class)
                .map(ResponseEntity::ok)
                .onErrorResume(e -> Mono.just(
                ResponseEntity.internalServerError().body(Map.of("message", "Simplification failed"))
                ));
    }

    private String extractText(String filename, byte[] bytes) {
        String ext = StringUtils.getFilenameExtension(filename);
        if (ext != null && ext.equalsIgnoreCase("pdf")) {
            return extractTextFromPdf(bytes);
        }

        if (ext != null && ext.equalsIgnoreCase("docx")) {
            return extractTextFromDocx(bytes);
        }

        if (ext != null && ext.equalsIgnoreCase("txt")) {
            return new String(bytes, StandardCharsets.UTF_8);
        }

        throw new IllegalArgumentException("Unsupported file type. Please upload PDF, DOCX, or TXT files.");
    }

    private String extractTextFromPdf(byte[] pdfBytes) {
        try (PDDocument doc = Loader.loadPDF(pdfBytes)) {
            return new PDFTextStripper().getText(doc);
        } catch (Exception e) {
            throw new RuntimeException("PDF processing failed", e);
        }
    }

    private String extractTextFromDocx(byte[] docxBytes) {
        try (XWPFDocument docx = new XWPFDocument(new ByteArrayInputStream(docxBytes));
             XWPFWordExtractor extractor = new XWPFWordExtractor(docx)) {
            return extractor.getText();
        } catch (Exception e) {
            throw new RuntimeException("DOCX processing failed", e);
        }
    }

    // Helper class for sending text as JSON to NLP service
    public static class TextRequest {
        private String text;
        private String jurisdiction;

        public TextRequest() {}

        public TextRequest(String text, String jurisdiction) {
            this.text = text;
            this.jurisdiction = (jurisdiction == null || jurisdiction.isBlank()) ? "Global" : jurisdiction;
        }

        public String getText() { return text; }
        public void setText(String text) { this.text = text; }
        public String getJurisdiction() { return jurisdiction; }
        public void setJurisdiction(String jurisdiction) { this.jurisdiction = jurisdiction; }
    }
}
