import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

/**
 * Builds the whole dashboard into one self-contained .html file.
 *
 * Used for sharing a runnable copy where there is no dev server — the app is
 * entirely client-side, so a single file loses nothing, including the import
 * flow (the File API reads from disk, not from a server).
 *
 * `assetsInlineLimit` is set absurdly high on purpose: the fonts are the only
 * remaining external requests, and a shared page has no origin to fetch them
 * from. Base64-ing them costs ~100KB and makes the file genuinely portable.
 *
 * `npm run build:single`
 */
export default defineConfig({
  plugins: [react(), tailwindcss(), viteSingleFile()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  build: {
    outDir: 'dist-single',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    reportCompressedSize: false,
  },
})
