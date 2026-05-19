package com.legalai.modules.documents.dto;

import java.util.List;

public record DocumentExtractionResult(
        String fileName,
        String extension,
        String text,
        String extractionMethod,
        boolean ocrRecommended,
        double ocrConfidence,
        List<String> warnings
) {}