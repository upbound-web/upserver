import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'

// Configure the devtools event bus port (defaults to 42069)
// This can be overridden via FRONTEND_DEVTOOLS_PORT env var to avoid conflicts
const devtoolsPort = process.env.FRONTEND_DEVTOOLS_PORT
  ? parseInt(process.env.FRONTEND_DEVTOOLS_PORT)
  : 42069

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    devtools({
      eventBusConfig: { port: devtoolsPort },
    }),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
