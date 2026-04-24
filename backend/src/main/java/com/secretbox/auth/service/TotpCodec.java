package com.secretbox.auth.service;

import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Base64;

/**
 * 서버 사이드 TOTP (RFC 6238) — 마스터 로그인 2FA 검증용.
 * 클라이언트의 frontend/src/lib/totp.ts와 같은 알고리즘 (SHA1 + 30s + 6자리).
 *
 * verify는 ±1 period 윈도우를 허용해 시계 오차 30s까지 통과시킨다.
 */
@Component
public class TotpCodec {

    private static final String BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    /** Recovery code용 — 헷갈리는 0/O, 1/I/L 제외 */
    private static final String RECOVERY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

    private static final SecureRandom RANDOM = new SecureRandom();
    private static final int SECRET_BYTES = 20;          // 160-bit, SHA1 표준 권장
    private static final int PERIOD = 30;
    private static final int DIGITS = 6;
    private static final int VERIFY_WINDOW = 1;          // ±1 period (=±30s)

    // ---------------- secret 생성/인코딩 ----------------

    public String generateSecret() {
        byte[] bytes = new byte[SECRET_BYTES];
        RANDOM.nextBytes(bytes);
        return base32Encode(bytes);
    }

    public String otpauthUri(String secret, String email, String issuer) {
        String encEmail = URLEncoder.encode(email, StandardCharsets.UTF_8);
        String encIssuer = URLEncoder.encode(issuer, StandardCharsets.UTF_8);
        return "otpauth://totp/" + encIssuer + ":" + encEmail
            + "?secret=" + secret
            + "&issuer=" + encIssuer
            + "&algorithm=SHA1&digits=" + DIGITS + "&period=" + PERIOD;
    }

    // ---------------- TOTP 검증 ----------------

    /** code가 현재 시각 ±1 period 내에서 유효하면 true */
    public boolean verify(String base32Secret, String code) {
        if (base32Secret == null || code == null) return false;
        String trimmed = code.replaceAll("\\s", "");
        if (trimmed.length() != DIGITS) return false;

        long counter = Instant.now().getEpochSecond() / PERIOD;
        for (long delta = -VERIFY_WINDOW; delta <= VERIFY_WINDOW; delta++) {
            try {
                String expected = generateAt(base32Secret, counter + delta);
                if (constantTimeEquals(expected, trimmed)) return true;
            } catch (Exception e) {
                return false;
            }
        }
        return false;
    }

    /**
     * 특정 counter에서 코드가 맞는지 검증.
     * confirmEnable에서 두 연속 코드(현재 + 다음 period) 검증할 때 사용.
     */
    public boolean verifyAtCounter(String base32Secret, String code, long counter) {
        if (base32Secret == null || code == null) return false;
        String trimmed = code.replaceAll("\\s", "");
        if (trimmed.length() != DIGITS) return false;
        try {
            return constantTimeEquals(generateAt(base32Secret, counter), trimmed);
        } catch (Exception e) {
            return false;
        }
    }

    public long currentCounter() {
        return Instant.now().getEpochSecond() / PERIOD;
    }

    private String generateAt(String base32Secret, long counter) throws Exception {
        byte[] secret = base32Decode(base32Secret);
        byte[] counterBytes = ByteBuffer.allocate(8).putLong(counter).array();
        Mac mac = Mac.getInstance("HmacSHA1");
        mac.init(new SecretKeySpec(secret, "HmacSHA1"));
        byte[] hmac = mac.doFinal(counterBytes);
        int offset = hmac[hmac.length - 1] & 0x0f;
        int otp = ((hmac[offset] & 0x7f) << 24)
            | ((hmac[offset + 1] & 0xff) << 16)
            | ((hmac[offset + 2] & 0xff) << 8)
            | (hmac[offset + 3] & 0xff);
        int truncated = otp % (int) Math.pow(10, DIGITS);
        return String.format("%0" + DIGITS + "d", truncated);
    }

    // ---------------- recovery code (단일 long code, kill-switch) ----------------

    /**
     * 32자 single-use long recovery code (구분자 없음).
     * 헷갈리는 글자(0/O/1/I/L) 제외 → 옮겨적기 안전.
     * log2(31) × 32 ≈ 158bit 엔트로피, 무차별 대입 사실상 불가.
     * 사용자가 dash/공백 넣어 입력해도 hashRecoveryCode가 정규화하므로 문제없음.
     */
    public String generateLongRecoveryCode() {
        StringBuilder sb = new StringBuilder(32);
        for (int i = 0; i < 32; i++) {
            sb.append(RECOVERY_ALPHABET.charAt(RANDOM.nextInt(RECOVERY_ALPHABET.length())));
        }
        return sb.toString();
    }

    /** 입력 정규화 (대문자, 하이픈/공백 제거) 후 SHA-256 base64. 저장/비교용. */
    public String hashRecoveryCode(String code) {
        if (code == null) return "";
        String norm = code.toUpperCase().replaceAll("[\\s-]", "");
        return sha256(norm);
    }

    // ---------------- base32 ----------------

    private static String base32Encode(byte[] data) {
        StringBuilder sb = new StringBuilder();
        int buffer = 0, bits = 0;
        for (byte b : data) {
            buffer = (buffer << 8) | (b & 0xff);
            bits += 8;
            while (bits >= 5) {
                bits -= 5;
                sb.append(BASE32.charAt((buffer >>> bits) & 0x1f));
            }
        }
        if (bits > 0) {
            sb.append(BASE32.charAt((buffer << (5 - bits)) & 0x1f));
        }
        return sb.toString();
    }

    private static byte[] base32Decode(String s) {
        String cleaned = s.toUpperCase().replaceAll("[\\s-]", "").replaceAll("=+$", "");
        ArrayList<Byte> out = new ArrayList<>();
        int buffer = 0, bits = 0;
        for (char ch : cleaned.toCharArray()) {
            int idx = BASE32.indexOf(ch);
            if (idx < 0) throw new IllegalArgumentException("invalid base32 char: " + ch);
            buffer = (buffer << 5) | idx;
            bits += 5;
            if (bits >= 8) {
                bits -= 8;
                out.add((byte) ((buffer >>> bits) & 0xff));
            }
        }
        byte[] result = new byte[out.size()];
        for (int i = 0; i < out.size(); i++) result[i] = out.get(i);
        return result;
    }

    private static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return Base64.getEncoder().encodeToString(md.digest(input.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 missing", e);
        }
    }

    private static boolean constantTimeEquals(String a, String b) {
        if (a.length() != b.length()) return false;
        int diff = 0;
        for (int i = 0; i < a.length(); i++) diff |= a.charAt(i) ^ b.charAt(i);
        return diff == 0;
    }
}
