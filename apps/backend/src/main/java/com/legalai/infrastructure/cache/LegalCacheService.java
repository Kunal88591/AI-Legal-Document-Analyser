package com.legalai.infrastructure.cache;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.data.redis.core.ReactiveStringRedisTemplate;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;

import java.time.Duration;

@Service
public class LegalCacheService {

    private static final Logger log = LoggerFactory.getLogger(LegalCacheService.class);
    private static final String ANALYSIS_PREFIX = "legal:analysis:";
    private static final String SIMPLIFY_PREFIX = "legal:simplify:";

    private final ReactiveStringRedisTemplate redisTemplate;

    public LegalCacheService(ObjectProvider<ReactiveStringRedisTemplate> redisTemplateProvider) {
        this.redisTemplate = redisTemplateProvider.getIfAvailable();
        if (this.redisTemplate != null) {
            log.info("Redis reactive cache initialized successfully.");
        } else {
            log.warn("Redis reactive cache is not available; running with in-memory/direct passthrough fallback.");
        }
    }

    public Mono<String> getCachedAnalysis(String documentId) {
        if (redisTemplate == null || documentId == null) {
            return Mono.empty();
        }
        return redisTemplate.opsForValue().get(ANALYSIS_PREFIX + documentId)
                .onErrorResume(err -> {
                    log.warn("Redis read error for key {}{}: {}", ANALYSIS_PREFIX, documentId, err.getMessage());
                    return Mono.empty();
                });
    }

    public Mono<Void> cacheAnalysis(String documentId, String analysisJson) {
        if (redisTemplate == null || documentId == null || analysisJson == null) {
            return Mono.empty();
        }
        return redisTemplate.opsForValue().set(ANALYSIS_PREFIX + documentId, analysisJson, Duration.ofHours(24))
                .onErrorResume(err -> {
                    log.warn("Redis write error for key {}{}: {}", ANALYSIS_PREFIX, documentId, err.getMessage());
                    return Mono.empty();
                })
                .then();
    }

    public Mono<String> getCachedSimplification(String hash) {
        if (redisTemplate == null || hash == null) {
            return Mono.empty();
        }
        return redisTemplate.opsForValue().get(SIMPLIFY_PREFIX + hash)
                .onErrorResume(err -> {
                    log.warn("Redis read error for key {}{}: {}", SIMPLIFY_PREFIX, hash, err.getMessage());
                    return Mono.empty();
                });
    }

    public Mono<Void> cacheSimplification(String hash, String simplificationJson) {
        if (redisTemplate == null || hash == null || simplificationJson == null) {
            return Mono.empty();
        }
        return redisTemplate.opsForValue().set(SIMPLIFY_PREFIX + hash, simplificationJson, Duration.ofDays(7))
                .onErrorResume(err -> {
                    log.warn("Redis write error for key {}{}: {}", SIMPLIFY_PREFIX, hash, err.getMessage());
                    return Mono.empty();
                })
                .then();
    }
}
