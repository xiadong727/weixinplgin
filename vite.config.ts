import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// 独立网页版（一键排版 + 复制到公众号）
export default defineConfig({
  root: resolve(__dirname, 'src/web'),
  base: './',
  resolve: {
    alias: { '@core': resolve(__dirname, 'src/core'), '@ui': resolve(__dirname, 'src/ui') },
  },
  build: {
    outDir: resolve(__dirname, 'dist/web'),
    emptyOutDir: true,
    target: 'es2020',
  },
})
