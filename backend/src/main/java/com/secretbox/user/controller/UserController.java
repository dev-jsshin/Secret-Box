package com.secretbox.user.controller;

import com.secretbox.auth.security.AuthenticatedUser;
import com.secretbox.user.dto.ChangePasswordRequest;
import com.secretbox.user.dto.ChangePasswordResponse;
import com.secretbox.user.dto.RevokeOthersRequest;
import com.secretbox.user.dto.RevokeOthersResponse;
import com.secretbox.user.dto.SessionListResponse;
import com.secretbox.user.dto.TwoFactorCodeRequest;
import com.secretbox.user.dto.TwoFactorConfirmRequest;
import com.secretbox.user.dto.TwoFactorEnableConfirmResponse;
import com.secretbox.user.dto.TwoFactorInitResponse;
import com.secretbox.user.dto.TwoFactorStatusResponse;
import com.secretbox.user.service.TwoFactorService;
import com.secretbox.user.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final TwoFactorService twoFactorService;

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
                httpRequest.getHeader("User-Agent"),
                clientIp(httpRequest),
                httpRequest.getHeader("X-Device-Id"))
        );
    }

    @GetMapping("/me/sessions")
    public ResponseEntity<SessionListResponse> listSessions(
        @AuthenticationPrincipal AuthenticatedUser user,
        @RequestHeader(value = "X-Current-Refresh", required = false) String currentRefreshToken
    ) {
        return ResponseEntity.ok(
            userService.listSessions(user.userId(), currentRefreshToken)
        );
    }

    @PostMapping("/me/sessions/{sessionId}/revoke")
    public ResponseEntity<Void> revokeSession(
        @AuthenticationPrincipal AuthenticatedUser user,
        @PathVariable UUID sessionId
    ) {
        userService.revokeSession(user.userId(), sessionId);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/me/sessions/revoke-others")
    public ResponseEntity<RevokeOthersResponse> revokeOtherSessions(
        @AuthenticationPrincipal AuthenticatedUser user,
        @Valid @RequestBody RevokeOthersRequest request
    ) {
        int revoked = userService.revokeOtherSessions(user.userId(), request.currentRefreshToken());
        return ResponseEntity.ok(new RevokeOthersResponse(revoked));
    }

    // ==========================================================
    // 2FA (TOTP) — 마스터 로그인용
    // ==========================================================

    @GetMapping("/me/2fa")
    public ResponseEntity<TwoFactorStatusResponse> getTwoFactorStatus(
        @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return ResponseEntity.ok(twoFactorService.status(user.userId()));
    }

    @PostMapping("/me/2fa/init")
    public ResponseEntity<TwoFactorInitResponse> initTwoFactor(
        @AuthenticationPrincipal AuthenticatedUser user
    ) {
        return ResponseEntity.ok(twoFactorService.initEnable(user.userId()));
    }

    @PostMapping("/me/2fa/confirm")
    public ResponseEntity<TwoFactorEnableConfirmResponse> confirmTwoFactor(
        @AuthenticationPrincipal AuthenticatedUser user,
        @Valid @RequestBody TwoFactorConfirmRequest request
    ) {
        return ResponseEntity.ok(
            twoFactorService.confirmEnable(user.userId(), request.code1(), request.code2())
        );
    }

    @PostMapping("/me/2fa/disable")
    public ResponseEntity<Void> disableTwoFactor(
        @AuthenticationPrincipal AuthenticatedUser user,
        @Valid @RequestBody TwoFactorCodeRequest request
    ) {
        twoFactorService.disable(user.userId(), request.code());
        return ResponseEntity.noContent().build();
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
