import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current working directory.
  const env = loadEnv(mode, process.cwd())
  
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      define: {
        'process.env.VITE_QC_WATCH_FOLDER': JSON.stringify(env.VITE_QC_WATCH_FOLDER),
        'process.env.VITE_QC_API_URL': JSON.stringify(env.VITE_QC_API_URL),
        'process.env.VITE_QC_API_KEY': JSON.stringify(env.VITE_QC_API_KEY),
        'process.env.VITE_QC_POLLING_INTERVAL': JSON.stringify(env.VITE_QC_POLLING_INTERVAL),
        'process.env.VITE_QC_AUTO_SUBMIT': JSON.stringify(env.VITE_QC_AUTO_SUBMIT),
        'process.env.VITE_QC_MAX_RETRIES': JSON.stringify(env.VITE_QC_MAX_RETRIES)
      }
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
  }
})
