package com.secretbox.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

/**
 * CORS 설정. 허용 Origin 패턴은 application.yml의
 * app.cors.allowed-origin-patterns 에서 관리하며 코드를 건드리지 않고
 * 변경할 수 있다.
 */
@Configuration
public class CorsConfig {

    // String[]로 받으면 YAML list와 콤마 구분 env 양쪽 모두 자동 변환됨
    @Value("${app.cors.allowed-origin-patterns}")
    private String[] allowedOriginPatterns;

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        var cfg = new CorsConfiguration();
        cfg.setAllowedOriginPatterns(List.of(allowedOriginPatterns));
        cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        cfg.setAllowedHeaders(List.of("*"));
        cfg.setAllowCredentials(true);
        cfg.setMaxAge(3600L);

        var source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", cfg);
        return source;
    }
}
