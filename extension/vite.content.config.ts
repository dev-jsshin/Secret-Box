import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));

// Content script 전용 빌드 — IIFE 단일 파일로 번들, 모든 import inlined.
// MV3 content_scripts.js 항목은 classic script로 로드되므로 ES import가 살아있으면 안 됨.
// vite의 lib 모드 + iife format이 가장 단순한 해법.
export default defineConfig({
  root,
  build: {
    outDir: 'dist',
    emptyOutDir: false, // 메인 빌드 결과 보존
    sourcemap: true,
    lib: {
      entry: resolve(root, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'SecretBoxContent',
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: {
        // IIFE는 단일 파일이라 chunk가 안 나오지만 명시적으로 잡아둠
        inlineDynamicImports: true,
      },
    },
  },
  resolve: {
    alias: {
      '@sb/crypto': resolve(root, '../frontend/src/crypto'),
      '@sb/lib': resolve(root, '../frontend/src/lib'),
    },
  },
});
