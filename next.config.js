/** @type {import('next').NextConfig} */
module.exports = {
  experimental: {
    serverActions: { bodySizeLimit: '50mb' },
    serverComponentsExternalPackages: ['pdf-parse'],
  },
};
