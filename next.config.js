/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  register: false,
  skipWaiting: true,
  disable: true, // Deshabilitar PWA en pruebas locales para evitar caché en iPhone
});

const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);
