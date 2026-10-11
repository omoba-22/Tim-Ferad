import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import handlebars from 'vite-plugin-handlebars'
import { fileURLToPath } from 'node:url'

const p = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: 'src',
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      // Every new page gets added here as we build it.
      input: { index: p('./src/index.html') },
    },
  },
  plugins: [
    tailwindcss(),
    // Lets pages share the header and footer with {{> header }} and {{> footer }}
    handlebars({ partialDirectory: p('./src/partials') }),
  ],
})