package com.secretbox.auth.service;

import com.secretbox.auth.dto.RegisterRequest;
import com.secretbox.auth.dto.RegisterResponse;
import com.secretbox.common.exception.ApiException;
import com.secretbox.user.domain.User;
import com.secretbox.user.repository.UserRepository;
import de.mkammerer.argon2.Argon2;
import de.mkammerer.argon2.Argon2Factory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Base64;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final Argon2 argon2 = Argon2Factory.create(Argon2Factory.Argon2Types.ARGON2id);

    @Value("${app.security.kdf.min-iterations}")
    private int minIterations;

    @Value("${app.security.kdf.min-memory-kb}")
    private int minMemoryKb;

    @Value("${app.security.kdf.min-parallelism}")
    private int minParallelism;

    // Server-side Argon2 params: authHash를 DB에 저장하기 전 한 번 더 해시
    private static final int SERVER_ARGON2_ITERATIONS = 3;
    private static final int SERVER_ARGON2_MEMORY_KB = 65536;
    private static final int SERVER_ARGON2_PARALLELISM = 4;

    @Transactional
    public RegisterResponse register(RegisterRequest req) {
        validateKdfParams(req);

        if (userRepository.existsByEmail(req.email())) {
            throw new ApiException(HttpStatus.CONFLICT, "EMAIL_ALREADY_EXISTS",
                "이미 가입된 이메일입니다");
        }

        // 클라이언트의 authHash는 이미 HMAC으로 유도된 값이지만,
        // DB 탈취 시 재공격 방지를 위해 서버에서도 Argon2로 한 번 더 해시.
        String storedAuthHash = argon2.hash(
            SERVER_ARGON2_ITERATIONS,
            SERVER_ARGON2_MEMORY_KB,
            SERVER_ARGON2_PARALLELISM,
            req.authHash().toCharArray()
        );

        User user = User.builder()
            .email(req.email())
            .authHash(storedAuthHash)
            .kdfSalt(decodeBase64(req.kdfSalt(), "kdfSalt"))
            .kdfIterations(req.kdfIterations())
            .kdfMemoryKb(req.kdfMemoryKb())
            .kdfParallelism(req.kdfParallelism())
            .protectedDek(decodeBase64(req.protectedDek(), "protectedDek"))
            .protectedDekIv(decodeBase64(req.protectedDekIv(), "protectedDekIv"))
            .recoveryHash(req.recoveryCodeHash())
            .twoFactorEnabled(true)
            .build();

        User saved = userRepository.save(user);
        log.info("User registered: id={}, email={}", saved.getId(), saved.getEmail());

        return new RegisterResponse(
            saved.getId(),
            saved.getEmail(),
            "가입이 완료되었습니다."
        );
    }

    private void validateKdfParams(RegisterRequest req) {
        if (req.kdfIterations() < minIterations
            || req.kdfMemoryKb() < minMemoryKb
            || req.kdfParallelism() < minParallelism) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "WEAK_KDF_PARAMS",
                "KDF 파라미터가 최소 요구 사양보다 약합니다");
        }
    }

    private byte[] decodeBase64(String value, String fieldName) {
        try {
            return Base64.getDecoder().decode(value);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_BASE64",
                fieldName + " 필드의 base64 디코딩 실패");
        }
    }
}
