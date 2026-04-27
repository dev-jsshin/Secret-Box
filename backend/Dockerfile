# syntax=docker/dockerfile:1.6
#
# Multi-stage build:
#   1) Gradle + JDK로 bootJar 생성
#   2) JRE-only 런타임 이미지에 jar 복사 → 최종 ~180MB
#
# 빌드:  docker build -t secretbox-backend .
# 실행:  docker run -p 6333:6333 --env-file .env secretbox-backend

FROM eclipse-temurin:21-jdk AS builder
WORKDIR /workspace

# 의존성 캐싱 레이어 — 빌드 스크립트만 먼저 복사
COPY build.gradle settings.gradle ./
COPY gradle ./gradle
COPY gradlew ./
RUN chmod +x gradlew && ./gradlew --no-daemon dependencies > /dev/null 2>&1 || true

# 소스 복사 + 빌드
COPY src ./src
RUN ./gradlew --no-daemon bootJar

# ---------- 런타임 ----------
# Alpine(musl) 대신 Debian-based JRE 사용 — Argon2 native lib이 glibc 의존이라
# Alpine에선 native crash 발생
FROM eclipse-temurin:21-jre
RUN groupadd -r app && useradd -r -g app -s /sbin/nologin app
WORKDIR /app
COPY --from=builder /workspace/build/libs/*.jar app.jar
RUN chown -R app:app /app
USER app
EXPOSE 6333
# -XX:+UseZGC: 낮은 지연, 메모리 효율. 개인/소규모 배포에 충분
ENTRYPOINT ["java", "-XX:+UseZGC", "-XX:+ZGenerational", "-jar", "/app/app.jar"]
