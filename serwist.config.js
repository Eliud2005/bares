// serwist.config.js
/** @type {import('@serwist/cli').SerwistConfig} */
export default {
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  globDirectory: '.next',  // 👈 Carpeta de build de Next.js
  globPatterns: [
    '**/*.{js,css,html,ico,png,svg,woff,woff2}',
  ],
  globIgnores: [
    '**/node_modules/**',
    '**/server/**',  // Ignorar el server-side de Next
  ],
};