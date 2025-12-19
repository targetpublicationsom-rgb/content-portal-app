import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// import { createHash } from 'crypto'

// // Polyfill for Vite's crypto.hash compatibility issue
// if (!global.crypto?.hash) {
//   if (!global.crypto) global.crypto = {}
//   global.crypto.hash = (data: string | Buffer) => {
//     return createHash('sha256').update(data).digest('hex')
//   }
// }

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [react(), tailwindcss()]
  }
})
