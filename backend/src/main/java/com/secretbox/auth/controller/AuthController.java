package com.secretbox.auth.controller;

import com.secretbox.auth.dto.Login2faRequest;
import com.secretbox.auth.dto.LoginRequest;
import com.secretbox.auth.dto.LoginResponse;
import com.secretbox.auth.dto.LogoutRequest;
import com.secretbox.auth.dto.PreLoginRequest;
import com.secretbox.auth.dto.PreLoginResponse;
import com.secretbox.auth.dto.RefreshRequest;
import com.secretbox.auth.dto.RefreshResponse;
import com.secretbox.auth.dto.RegisterRequest;
import com.secretbox.auth.dto.RegisterResponse;
import com.secretbox.auth.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<RegisterResponse> register(@Valid @RequestBody RegisterRequest request) {
        RegisterResponse body = authService.register(request);
        return ResponseEntity.status(HttpStatus.CREATED).body(body);
    }

    @PostMapping("/pre-login")
    public ResponseEntity<PreLoginResponse> preLogin(@Valid @RequestBody PreLoginRequest request) {
        return ResponseEntity.ok(authService.preLogin(request));
    }

    @PostMapping("/login")
    public ResponseEntity<LoginResponse> login(
        @Valid @RequestBody LoginRequest request,
        HttpServletRequest httpRequest
    ) {
        return ResponseEntity.ok(
            authService.login(request,
                httpRequest.getHeader("User-Agent"),
                clientIp(httpRequest),
                httpRequest.getHeader("X-Device-Id"))
        );
    }

    @PostMapping("/login-2fa")
    public ResponseEntity<LoginResponse> loginTwoFactor(
        @Valid @RequestBody Login2faRequest request,
        HttpServletRequest httpRequest
    ) {
        return ResponseEntity.ok(
            authService.loginTwoFactor(
                request.twoFactorToken(),
                request.code(),
                httpRequest.getHeader("User-Agent"),
                clientIp(httpRequest),
                httpRequest.getHeader("X-Device-Id"))
        );
    }

    @PostMapping("/refresh")
    public ResponseEntity<RefreshResponse> refresh(
        @Valid @RequestBody RefreshRequest request,
        HttpServletRequest httpRequest
    ) {
        return ResponseEntity.ok(
            authService.refresh(request.refreshToken(),
                httpRequest.getHeader("User-Agent"), clientIp(httpRequest))
        );
    }

    @PostMapping("/logout")
    public ResponseEntity<Void> logout(@Valid @RequestBody LogoutRequest request) {
        authService.logout(request.refreshToken());
        return ResponseEntity.noContent().build();
    }

    private static String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return req.getRemoteAddr();
    }
}
