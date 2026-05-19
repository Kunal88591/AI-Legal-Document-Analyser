package com.legalai.modules.documents.dto;

import java.util.Map;

public record ComparisonResponse(
        String comparisonId,
        String oldFileName,
        String newFileName,
        Map<String, Object> result
) {}