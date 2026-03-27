import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/socket.io/:path*",
        destination: "http://159.65.200.145:4000/socket.io/:path*",
      },
    ];
  },
};

export default nextConfig;
