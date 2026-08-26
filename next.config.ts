import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingExcludes: {
    "*": [
      "./data/**/*",
      "./release/**/*",
      "./pack/**/*",
      "./desktop/**/*",
      "./installer/**/*",
    ],
  },
  serverExternalPackages: ["archiver", "jpeg-js", "jszip", "pngjs"],
  experimental: {
    proxyClientMaxBodySize: "50mb",
  },
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.cursor.sh",
    "*.cursor.com",
    "*.cursorusercontent.com",
  ],
};

export default nextConfig;
