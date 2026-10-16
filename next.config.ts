import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "192.168.1.153",
    "192.168.1.52",
    "192.168.*.*",
    "10.*.*.*",
    "172.*.*.*",
    "localhost",
  ],
};

export default nextConfig;
