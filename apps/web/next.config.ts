import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: '/api/socket.io',
        destination: 'http://127.0.0.1:4000/socket.io/',
      },
      {
        source: '/api/socket.io/:path*',
        destination: 'http://127.0.0.1:4000/socket.io/:path*',
      },
      {
        source: '/api/:path*',
        destination: 'http://127.0.0.1:4000/:path*',
      },
    ];
  },
};

export default nextConfig;
