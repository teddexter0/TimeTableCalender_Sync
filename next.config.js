/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'tesseract.js', '@tesseract.js-data/eng', '@napi-rs/canvas'],
  },
};

module.exports = nextConfig;
