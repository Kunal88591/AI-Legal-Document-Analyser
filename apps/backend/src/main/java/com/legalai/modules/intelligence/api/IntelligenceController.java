package com.legalai.modules.intelligence.api;

import com.legalai.infrastructure.ai.NlpGatewayClient;
import com.legalai.modules.intelligence.dto.GraphResponse;
import com.legalai.modules.intelligence.dto.TimelineResponse;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/intelligence")
public class IntelligenceController {

    private final NlpGatewayClient nlpGatewayService;

    public IntelligenceController(NlpGatewayClient nlpGatewayService) {
        this.nlpGatewayService = nlpGatewayService;
    }

    @GetMapping("/graph/{documentId}")
    public Mono<GraphResponse> graph(@PathVariable String documentId) {
        return nlpGatewayService.graph(documentId);
    }

    @GetMapping("/timeline/{documentId}")
    public Mono<TimelineResponse> timeline(@PathVariable String documentId) {
        return nlpGatewayService.timeline(documentId);
    }
}