import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import handlebars from 'vite-plugin-handlebars'
import { fileURLToPath } from 'node:url'
import site from './site.config.js'

const p = (path) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  root: 'src',
  // The .env file lives in frontend/, not in frontend/src/
  envDir: p('./'),
  publicDir: '../public',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      // Every new page must be listed here.
      input: {
        index: p('./src/index.html'),
        travel: p('./src/travel.html'),
        book: p('./src/book.html'),
        paymentResult: p('./src/payment-result.html'),
        ticket: p('./src/ticket.html'),
        delivery: p('./src/delivery.html'),
        about: p('./src/about.html'),
        contact: p('./src/contact.html'),
        faqs: p('./src/faqs.html'),
        terms: p('./src/terms.html'),
        privacy: p('./src/privacy.html'),
        notFound: p('./src/404.html'),
      },
    },
  },
  plugins: [
    tailwindcss(),
    handlebars({
      partialDirectory: p('./src/partials'),
      context: site, // makes {{phoneTel}}, {{email}} etc. available in every page
    }),
  ],
})
