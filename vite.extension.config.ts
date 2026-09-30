import { defineConfig } from 'vite'
import { resolve } from 'node:path'
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'

function copyDir(from: string, to: string) {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    const src = resolve(from, name)
    const dst = resolve(to, name)
    if (statSync(src).isDirectory()) copyDir(src, dst)
    else copyFileSync(src, dst)
  }
}

// Chrome MV3 扩展：content script 单文件 IIFE，避免 MV3 的 ESM 限制
export default defineConfig({
  resolve: {
    alias: { '@core': resolve(__dirname, 'src/core'), '@ui': resolve(__dirname, 'src/ui') },
  },
  build: {
    outDir: resolve(__dirname, 'dist/extension'),
    emptyOutDir: true,
    target: 'es2020',
    cssCodeSplit: false,
    lib: {
      entry: resolve(__dirname, 'src/extension/content/content.ts'),
      name: 'WxTypeset',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: { assetFileNames: 'content.[ext]', inlineDynamicImports: true },
    },
  },
  plugins: [
    {
      name: 'copy-extension-static',
      closeBundle() {
        const out = resolve(__dirname, 'dist/extension')
        copyFileSync(resolve(__dirname, 'src/extension/manifest.json'), resolve(out, 'manifest.json'))
        copyDir(resolve(__dirname, 'src/extension/popup'), resolve(out, 'popup'))
        copyDir(resolve(__dirname, 'src/extension/icons'), resolve(out, 'icons'))
      },
    },
  ],
})
