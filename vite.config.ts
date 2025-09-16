import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    // ngrokのホストを許可
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', 'localhost'],
    // HTTPS設定（必要に応じて有効化）
    // https: true,
    hmr: {
      // ngrok経由でのHMR対応
      overlay: true
    }
  },
  build: {
    // WebAssemblyファイルの処理
    assetsInlineLimit: 0,
    rollupOptions: {
      output: {
        manualChunks: {
          'zxing-wasm': ['zxing-wasm']
        }
      }
    }
  },
  optimizeDeps: {
    // zxing-wasmの事前バンドル
    include: ['zxing-wasm/reader']
  }
})