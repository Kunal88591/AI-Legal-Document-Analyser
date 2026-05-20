package com.legalai.modules.ai.api;

import com.legalai.infrastructure.ai.NlpGatewayClient;
import com.legalai.modules.ai.dto.ChatRequest;
import com.legalai.modules.ai.dto.ChatResponse;
import com.legalai.modules.ai.dto.HistoryResponse;
import com.legalai.modules.ai.dto.RetrievalRequest;
import com.legalai.modules.ai.service.ChatHistoryService;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@CrossOrigin(origins = "*")
@RestController
@RequestMapping("/api/copilot")
public class CopilotController {

    private final NlpGatewayClient nlpGatewayService;
    private final ChatHistoryService chatHistoryService;

    public CopilotController(NlpGatewayClient nlpGatewayService, ChatHistoryService chatHistoryService) {
        this.nlpGatewayService = nlpGatewayService;
        this.chatHistoryService = chatHistoryService;
    }

    @PostMapping("/chat")
    public Mono<ChatResponse> chat(@RequestBody ChatRequest request) {
        return chatHistoryService.chatAndPersist(request);
    }

    @PostMapping("/retrieve")
    public Mono<Object> retrieve(@RequestBody RetrievalRequest request) {
        return nlpGatewayService.retrieve(request);
    }

    @GetMapping("/history/{documentId}")
    public Mono<HistoryResponse> history(@PathVariable String documentId) {
        return chatHistoryService.history(documentId);
    }
}