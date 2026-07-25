import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// GitHub Pages 는 https://<user>.github.io/<repo>/ 경로로 서빙되므로 base 가 필요하다.
// 커스텀 도메인이나 <user>.github.io 리포지터리라면 VITE_BASE=/ 로 덮어쓴다.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/work-hub/',
  plugins: [react()],
  server: { port: 5173 },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
          markdown: ['marked', 'dompurify'],
        },
      },
    },
  },
})
