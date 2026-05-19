package com.legalai.infrastructure.websocket;

import com.legalai.infrastructure.websocket.LegalChatWebSocketHandler;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.HandlerMapping;
import org.springframework.web.reactive.config.EnableWebFlux;
import org.springframework.web.reactive.handler.SimpleUrlHandlerMapping;
import org.springframework.web.reactive.socket.WebSocketHandler;
import org.springframework.web.reactive.socket.server.support.WebSocketHandlerAdapter;

import java.util.HashMap;
import java.util.Map;

@Configuration
@EnableWebFlux
public class WebSocketConfig {

    @Bean
    public HandlerMapping webSocketMapping(LegalChatWebSocketHandler legalChatWebSocketHandler) {
        Map<String, WebSocketHandler> urlMap = new HashMap<>();
        urlMap.put("/ws/copilot", legalChatWebSocketHandler);

        SimpleUrlHandlerMapping mapping = new SimpleUrlHandlerMapping();
        mapping.setUrlMap(urlMap);
        mapping.setOrder(1);
        return mapping;
    }

    @Bean
    public WebSocketHandlerAdapter handlerAdapter() {
        return new WebSocketHandlerAdapter();
    }
}