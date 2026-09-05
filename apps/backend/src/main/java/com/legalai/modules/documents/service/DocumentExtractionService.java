package com.legalai.modules.documents.service;

import com.legalai.modules.documents.dto.DocumentExtractionResult;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.apache.poi.xwpf.extractor.XWPFWordExtractor;
import org.apache.poi.xwpf.usermodel.XWPFDocument;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;

@Service
public class DocumentExtractionService {

    public DocumentExtractionResult extract(String fileName, byte[] bytes) {
        String extension = StringUtils.getFilenameExtension(fileName);
        if (extension == null || extension.isBlank()) {
            throw new IllegalArgumentException("Unsupported file type. Please upload PDF, DOCX, or TXT files.");
        }

        String normalizedExtension = extension.toLowerCase();
        String text;
        String extractionMethod;

        switch (normalizedExtension) {
            case "pdf" -> {
                text = extractTextFromPdf(bytes);
                extractionMethod = "pdfbox";
            }
            case "docx" -> {
                text = extractTextFromDocx(bytes);
                extractionMethod = "apache-poi";
            }
            case "txt" -> {
                text = new String(bytes, StandardCharsets.UTF_8);
                extractionMethod = "plain-text";
            }
            default -> throw new IllegalArgumentException("Unsupported file type. Please upload PDF, DOCX, or TXT files.");
        }

        List<String> warnings = new ArrayList<>();
        double ocrConfidence = 0.0d;
        boolean ocrRecommended = false;

        if (text == null) {
            text = "";
        }

        String trimmed = text.trim();
        if (trimmed.length() < 180) {
            ocrRecommended = normalizedExtension.equals("pdf");
            warnings.add("Text extraction is sparse. The document may be scanned or image-based, so OCR fallback is recommended.");
        }

        if (normalizedExtension.equals("pdf") && trimmed.isEmpty()) {
            warnings.add("No machine-readable PDF text was detected.");
        }

        // Only assign genuine OCR confidence if OCR actually ran; for direct digital parsing, OCR is not used.
        // Fabricating confidence based on text length is misleading and inaccurate.

        return new DocumentExtractionResult(
                fileName,
                normalizedExtension,
                text,
                extractionMethod,
                ocrRecommended,
                ocrConfidence,
                warnings
        );
    }

    private String extractTextFromPdf(byte[] pdfBytes) {
        try (PDDocument document = Loader.loadPDF(pdfBytes)) {
            return new PDFTextStripper().getText(document);
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
}