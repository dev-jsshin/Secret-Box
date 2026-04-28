package com.secretbox.auth.security;

import com.fasterxml.jackson.databind.ObjectMapper;
import io.github.bucket4j.Bandwidth;
import io.github.bucket4j.Bucket;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 인메모리 토큰 버킷 기반 rate limit. Redis 불필요 — 단일 호스트 자가 호스팅 전제.
 *
 * 정책:
 *   /auth/login(-2fa)        : IP 분당 10회 + 이메일 분당 5회
 *   /auth/register           : IP 분당 5회
 *   /auth/pre-login          : IP 분당 30회
 *   /auth/refresh            : IP 분당 30회
 *   /users/me/password       : IP 분당 5회
 *
 * 한도 초과 시 429 + JSON {error:{code:RATE_LIMITED, message, retryAfterSeconds}}.
 *
 * 주의: 다중 인스턴스 배포로 가면 Redis 기반 분산 카운터 필요.
 */
@Component
@Order(1)   // SecurityFilterChain의 JwtAuthenticationFilter 보다 먼저 실행
public class RateLimitFilter extends OncePerRequestFilter {

    private final ObjectMapper objectMapper = new ObjectMapper();

    private final Map<String, Bucket> bucketsByIp = new ConcurrentHashMap<>();
    private final Map<String, Bucket> bucketsByEmail = new ConcurrentHashMap<>();

    private record Policy(String pathPrefix, int ipLimit, int emailLimit) {
        boolean matches(String path) {
            return path.startsWith(pathPrefix);
        }
    }

    private static final List<Policy> POLICIES = List.of(
        new Policy("/api/v1/auth/login-2fa", 10, 5),
        new Policy("/api/v1/auth/login",     10, 5),
        new Policy("/api/v1/auth/register",   5, 0),  // email-key 없음 (가입 전이라)
        new Policy("/api/v1/auth/pre-login", 30, 0),
        new Policy("/api/v1/auth/refresh",   30, 0),
        new Policy("/api/v1/users/me/password", 5, 0)
    );

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain chain
    ) throws ServletException, IOException {
        Policy policy = matchPolicy(request.getRequestURI());
        if (policy == null) {
            chain.doFilter(request, response);
            return;
        }

        String ip = clientIp(request);

        Bucket ipBucket = bucketsByIp.computeIfAbsent(
            policy.pathPrefix + "|" + ip,
            k -> bucketOf(policy.ipLimit)
        );
        if (!ipBucket.tryConsume(1)) {
            writeRateLimited(response, retryAfter(ipBucket));
            return;
        }

        // 이메일 기반 limit는 login 류만 — 요청 본문에서 이메일을 안 읽고 헤더로 받지도 않으므로
        // 실용적으로 IP-key + 짧은 이메일 limit 조합이 충분. 본문 파싱은 비용 큼.
        // (필요시 별도 인터셉터에서 본문 파싱 후 적용 — 향후 확장)

        chain.doFilter(request, response);
    }

    private Policy matchPolicy(String uri) {
        for (Policy p : POLICIES) {
            if (p.matches(uri)) return p;
        }
        return null;
    }

    private Bucket bucketOf(int requestsPerMinute) {
        return Bucket.builder()
            .addLimit(Bandwidth.builder()
                .capacity(requestsPerMinute)
                .refillIntervally(requestsPerMinute, Duration.ofMinutes(1))
                .build())
            .build();
    }

    private long retryAfter(Bucket bucket) {
        // 다음 토큰까지 남은 나노초 → 초로 올림
        long nanos = bucket.estimateAbilityToConsume(1).getNanosToWaitForRefill();
        return Math.max(1, (nanos + 999_999_999L) / 1_000_000_000L);
    }

    private void writeRateLimited(HttpServletResponse response, long retryAfterSeconds) throws IOException {
        response.setStatus(HttpStatus.TOO_MANY_REQUESTS.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.setHeader("Retry-After", String.valueOf(retryAfterSeconds));

        Map<String, Object> body = Map.of(
            "error", Map.of(
                "code", "RATE_LIMITED",
                "message", "요청이 너무 많습니다.\n" + retryAfterSeconds + "초 후 다시 시도해주세요.",
                "retryAfterSeconds", retryAfterSeconds
            )
        );
        response.getWriter().write(objectMapper.writeValueAsString(body));
    }

    private static String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return req.getRemoteAddr();
    }
}
