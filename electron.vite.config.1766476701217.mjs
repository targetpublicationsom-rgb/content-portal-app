// electron.vite.config.ts
import { resolve } from "path";
import { defineConfig, externalizeDepsPlugin, loadEnv } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
var __electron_vite_injected_dirname = "D:\\Target Publications\\content-portal-app";
var electron_vite_config_default = defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd());
  return {
    main: {
      plugins: [externalizeDepsPlugin()],
      build: {
        rollupOptions: {
          input: {
            index: resolve(__electron_vite_injected_dirname, "src/main/index.ts"),
            "workers/wordConverter.worker": resolve(__electron_vite_injected_dirname, "src/main/qc/workers/wordConverter.worker.ts"),
            "workers/pandoc.worker": resolve(__electron_vite_injected_dirname, "src/main/qc/workers/pandoc.worker.ts"),
            "workers/wordMerger.worker": resolve(__electron_vite_injected_dirname, "src/main/qc/workers/wordMerger.worker.ts"),
            "workers/reportParser.worker": resolve(__electron_vite_injected_dirname, "src/main/qc/workers/reportParser.worker.ts")
          },
          output: {
            entryFileNames: "[name].js"
          }
        }
      },
      define: {
        "process.env.VITE_QC_WATCH_FOLDER": JSON.stringify(env.VITE_QC_WATCH_FOLDER),
        "process.env.VITE_QC_API_URL": JSON.stringify(env.VITE_QC_API_URL),
        "process.env.VITE_QC_API_KEY": JSON.stringify(env.VITE_QC_API_KEY),
        "process.env.VITE_QC_POLLING_INTERVAL": JSON.stringify(env.VITE_QC_POLLING_INTERVAL),
        "process.env.VITE_QC_AUTO_SUBMIT": JSON.stringify(env.VITE_QC_AUTO_SUBMIT),
        "process.env.VITE_QC_MAX_RETRIES": JSON.stringify(env.VITE_QC_MAX_RETRIES)
      }
    },
    preload: {
      plugins: [externalizeDepsPlugin()]
    },
    renderer: {
      resolve: {
        alias: {
          "@renderer": resolve("src/renderer/src")
        }
      },
      plugins: [react(), tailwindcss()]
    }
  };
});
export {
  electron_vite_config_default as default
};
