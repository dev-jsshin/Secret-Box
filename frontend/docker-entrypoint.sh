#!/bin/sh
#
# 기동 시 self-signed 인증서가 없으면 생성하고, nginx를 foreground로 실행.
# 인증서 볼륨 마운트를 permanent하게 두면 재생성 없이 재사용 가능.

set -e

CERT_DIR=/etc/nginx/certs
mkdir -p "$CERT_DIR"

if [ ! -f "$CERT_DIR/cert.pem" ] || [ ! -f "$CERT_DIR/key.pem" ]; then
    echo "[entrypoint] generating self-signed TLS certificate (~10y validity)"
    openssl req -x509 -nodes -days 3650 \
        -newkey rsa:2048 \
        -keyout "$CERT_DIR/key.pem" \
        -out    "$CERT_DIR/cert.pem" \
        -subj   "/CN=secretbox" \
        -addext "subjectAltName=DNS:localhost,DNS:secretbox,IP:127.0.0.1,IP:0.0.0.0" \
        >/dev/null 2>&1
    chmod 600 "$CERT_DIR/key.pem"
    echo "[entrypoint] cert generated at $CERT_DIR/cert.pem"
fi

exec nginx -g 'daemon off;'
