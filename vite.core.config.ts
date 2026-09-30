import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// 把排版内核打成 ESM 单文件，供 node --test 直接 import
export default defineConfig({
  build: {
    outDir: resolve(__dirname, 'dist/core'),
    emptyOutDir: true,
    target: 'node20',
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/core/index.ts'),
      formats: ['es'],
      fileName: () => 'index.mjs',
    },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
})
