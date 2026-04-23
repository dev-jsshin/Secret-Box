package com.secretbox.auth.security;

import java.util.UUID;

/**
 * SecurityContext에 들어가는 인증된 사용자 정보.
 * @AuthenticationPrincipal로 컨트롤러에서 주입받을 수 있다.
 */
public record AuthenticatedUser(UUID userId, String email) {}
