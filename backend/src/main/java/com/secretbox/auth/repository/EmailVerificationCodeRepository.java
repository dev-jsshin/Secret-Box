package com.secretbox.auth.repository;

import com.secretbox.auth.domain.EmailVerificationCode;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface EmailVerificationCodeRepository extends JpaRepository<EmailVerificationCode, UUID> {
    List<EmailVerificationCode> findAllByUserIdAndPurposeAndUsedAtIsNull(UUID userId, String purpose);
}
