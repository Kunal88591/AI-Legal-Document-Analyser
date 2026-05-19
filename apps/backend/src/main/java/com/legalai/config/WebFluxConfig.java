package com.legalai.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.reactive.config.EnableWebFlux;

@Configuration
@EnableWebFlux
public class WebFluxConfig {
    // Default config is enough for most cases since Spring Boot 2.5+
    // Only add custom codecs if you have special needs
}
