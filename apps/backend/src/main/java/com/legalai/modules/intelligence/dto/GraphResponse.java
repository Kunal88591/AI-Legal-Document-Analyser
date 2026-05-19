package com.legalai.modules.intelligence.dto;

import java.util.List;
import java.util.Map;

public record GraphResponse(
        String documentId,
        List<Map<String, Object>> nodes,
        List<Map<String, Object>> edges,
        List<String> warnings
) {}