import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import mkcert from 'vite-plugin-mkcert';
import path from 'node:path';

// 포트와 백엔드 주소는 .env(.local)로 오버라이드 가능
//   VITE_PORT          : 프론트 dev server 포트 (기본 7444)
//   VITE_BACKEND_ORIGIN: 프록시 대상 (기본 http://localhost:6333)
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const frontendPort = Number(env.VITE_PORT ?? 7444);
  const backendOrigin = env.VITE_BACKEND_ORIGIN ?? 'http://localhost:6333';

  return {
    plugins: [
      react(),
      // 자체 서명 SSL 인증서 자동 생성. 최초 실행 시 sudo 비번 요구.
      mkcert(),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: frontendPort,
      host: true,             // LAN의 다른 PC도 접속 가능
      proxy: {
        '/api': {
          target: backendOrigin,
          changeOrigin: true,
          secure: false,
          xfwd: true,         // 원 client IP를 X-Forwarded-For 헤더로 전달
        },
      },
    },
  };
});
