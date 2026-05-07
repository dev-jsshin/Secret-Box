import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';

const root = dirname(fileURLToPath(import.meta.url));
const frontendSrc = resolve(root, '../frontend/src');

// MV3 확장은 단일 SPA가 아니라 entry가 4개 (popup/background/content/offscreen).
// rollupOptions.input으로 각 entry를 개별 번들로 빌드하고, manifest는 빌드 후
// 그대로 dist/로 복사한다 (build-time 변환 불필요).
export default defineConfig({
  root,
  plugins: [
    react(),
    {
      name: 'sb-copy-manifest',
      closeBundle() {
        const distDir = resolve(root, 'dist');
        if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true });
        copyFileSync(
          resolve(root, 'public/manifest.json'),
          resolve(distDir, 'manifest.json'),
        );
      },
    },
  ],
  resolve: {
    alias: {
      '@sb/crypto': resolve(frontendSrc, 'crypto'),
      '@sb/lib': resolve(frontendSrc, 'lib'),
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      // content script는 별도 IIFE 번들로 빌드(vite.content.config.ts)
      // 이유: MV3 content script는 ES 모듈로 로드되지 않으므로 import 구문이 그대로 살아있으면 즉시 실패
      input: {
        popup: resolve(root, 'src/popup/index.html'),
        offscreen: resolve(root, 'src/offscreen/index.html'),
        background: resolve(root, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => {
          if (chunk.name === 'background') return 'background.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
