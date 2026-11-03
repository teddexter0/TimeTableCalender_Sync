/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    serverComponentsExternalPackages: ['pdf-parse', 'tesseract.js', '@tesseract.js-data/eng', '@napi-rs/canvas'],
    outputFileTracingIncludes: {
      '/api/parse-timetable': [
        './node_modules/pdf-parse/dist/pdf-parse/cjs/pdf.worker.mjs',
        './node_modules/@tesseract.js-data/eng/**/*.traineddata.gz',
        './node_modules/tesseract.js/src/worker-script/node/**',
        './node_modules/tesseract.js-core/*.wasm*',
      ],
    },
  },
};

module.exports = nextConfig;
