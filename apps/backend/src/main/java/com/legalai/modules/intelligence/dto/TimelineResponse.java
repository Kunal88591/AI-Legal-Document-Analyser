package com.legalai.modules.intelligence.dto;

import java.util.List;
import java.util.Map;

public record TimelineResponse(
        String documentId,
        List<Map<String, Object>> events,
        List<Map<String, Object>> obligations,
        int upcomingCount,
        int urgentCount
) {}