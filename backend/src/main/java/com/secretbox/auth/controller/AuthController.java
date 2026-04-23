package com.secretbox.auth.controller;

import com.secretbox.auth.dto.LoginRequest;
import com.secretbox.auth.dto.LoginResponse;
import com.secretbox.auth.dto.PreLoginRequest;
import com.secretbox.auth.dto.PreLoginResponse;
import com.secretbox.auth.dto.RegisterRequest;
import com.secretbox.auth.dto.RegisterResponse;
import com.secretbox.auth.service.AuthService;
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
    public ResponseEntity<LoginResponse> login(@Valid @RequestBody LoginRequest request) {
        return ResponseEntity.ok(authService.login(request));
    }
}
