# syntax=docker/dockerfile:1.6
#
# Multi-stage build:
#   1) Node로 Vite 정적 빌드
#   2) nginx:alpine + openssl이 정적 파일 서빙 + /api 프록시 + HTTPS
#
# WebCrypto API는 secure context(HTTPS)에서만 동작하므로 HTTPS 필수.
# 컨테이너 첫 기동 시 self-signed 인증서를 자동 생성 → 브라우저 경고 한 번 수락하면
# 이후 같은 도메인에선 안 뜸.

FROM node:22-alpine AS builder
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Vite 프로덕션 빌드 (mkcert 플러그인은 dev server 전용이라 빌드엔 영향 없음)
RUN npm run build

# ---------- 런타임 ----------
FROM nginx:1.27-alpine
RUN apk add --no-cache openssl
COPY --from=builder /workspace/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint-secretbox.sh
RUN chmod +x /docker-entrypoint-secretbox.sh
EXPOSE 443
ENTRYPOINT ["/docker-entrypoint-secretbox.sh"]
