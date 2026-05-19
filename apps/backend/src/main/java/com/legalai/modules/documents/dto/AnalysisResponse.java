package com.legalai.modules.documents.dto;

import java.util.List;
import java.util.Map;

public record AnalysisResponse(
        String documentId,
        String fileName,
        String extractionMethod,
        boolean ocrRecommended,
        double ocrConfidence,
        List<String> warnings,
        Map<String, Object> analysis
) {}