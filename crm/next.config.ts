import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    position: 'bottom-right',
  },
  experimental: {
    serverActions: {
      allowedOrigins: [
        'ovjvi3pniekcrw-3001.proxy.runpod.net',
        '*.proxy.runpod.net',
      ],
    },
  },
};

export default nextConfig;
