package com.secretbox.user.controller;

import com.secretbox.auth.security.AuthenticatedUser;
import com.secretbox.user.dto.ChangePasswordRequest;
import com.secretbox.user.dto.ChangePasswordResponse;
import com.secretbox.user.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;

    @GetMapping("/me")
    public ResponseEntity<MeResponse> me(@AuthenticationPrincipal AuthenticatedUser user) {
        return ResponseEntity.ok(new MeResponse(user.userId().toString(), user.email()));
    }

    @PostMapping("/me/password")
    public ResponseEntity<ChangePasswordResponse> changePassword(
        @AuthenticationPrincipal AuthenticatedUser user,
        @Valid @RequestBody ChangePasswordRequest request,
        HttpServletRequest httpRequest
    ) {
        return ResponseEntity.ok(
            userService.changePassword(user.userId(), request,
                httpRequest.getHeader("User-Agent"), clientIp(httpRequest))
        );
    }

    public record MeResponse(String id, String email) {}

    private static String clientIp(HttpServletRequest req) {
        String xff = req.getHeader("X-Forwarded-For");
        if (xff != null && !xff.isBlank()) {
            return xff.split(",")[0].trim();
        }
        return req.getRemoteAddr();
    }
}
