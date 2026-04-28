package com.secretbox;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableAsync;

@SpringBootApplication
@EnableAsync   // AuditLogService.log를 별도 스레드에서 — 본 흐름 지연 방지
public class SecretBoxApplication {

    public static void main(String[] args) {
        SpringApplication.run(SecretBoxApplication.class, args);
    }
}
