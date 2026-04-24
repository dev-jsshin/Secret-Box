package com.secretbox.auth.filter;

import com.secretbox.auth.security.AuthenticatedUser;
import com.secretbox.auth.service.JwtService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.UUID;

/**
 * Authorization: Bearer <token> 헤더가 있으면 검증해서 SecurityContext에 인증 정보 채움.
 * 토큰이 없거나 잘못돼도 다음 필터로 통과 — 보호된 엔드포인트는 SecurityConfig가 거부.
 */
@Component
@RequiredArgsConstructor
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private static final String HEADER = "Authorization";
    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtService jwtService;

    @Override
    protected void doFilterInternal(
        HttpServletRequest request,
        HttpServletResponse response,
        FilterChain chain
    ) throws ServletException, IOException {
        String header = request.getHeader(HEADER);

        if (header != null && header.startsWith(BEARER_PREFIX)) {
            String token = header.substring(BEARER_PREFIX.length());
            try {
                Claims claims = jwtService.parse(token);
                // purpose claim이 있는 토큰(2fa 중간 단계 등)은 일반 인증으로 사용 금지
                String purpose = claims.get("purpose", String.class);
                if (purpose == null) {
                    UUID userId = UUID.fromString(claims.getSubject());
                    String email = claims.get("email", String.class);

                    var principal = new AuthenticatedUser(userId, email);
                    var auth = new UsernamePasswordAuthenticationToken(principal, null, List.of());
                    SecurityContextHolder.getContext().setAuthentication(auth);
                }
            } catch (JwtException | IllegalArgumentException ignored) {
                // 잘못된 토큰 → 미인증 상태로 통과
            }
        }

        chain.doFilter(request, response);
    }
}
