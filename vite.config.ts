import { defineConfig, build, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { viteStaticCopy } from 'vite-plugin-static-copy'
import { resolve } from 'path'

function buildExtensionScripts(): Plugin {
  return {
    name: 'build-extension-scripts',
    apply: 'build',
    async closeBundle() {
      for (const script of ['background', 'content']) {
        await build({
          configFile: false,
          build: {
            emptyOutDir: false,
            outDir: resolve(__dirname, 'dist'),
            rollupOptions: {
              input: resolve(__dirname, `${script}/index.ts`),
              output: {
                format: 'iife',
                entryFileNames: `${script}.js`,
                inlineDynamicImports: true,
              },
            },
          },
        })
      }
    },
  }
}

export default defineConfig({
  base: './',
  plugins: [
    react(),
    viteStaticCopy({
      targets: [{ src: 'manifest.json', dest: '' }],
    }),
    buildExtensionScripts(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'popup/index.html'),
        options: resolve(__dirname, 'options/index.html'),
      },
    },
  },
})
