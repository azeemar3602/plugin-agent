import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["archiver", "jpeg-js", "jszip", "pngjs"],
  allowedDevOrigins: [
    "127.0.0.1",
    "localhost",
    "*.cursor.sh",
    "*.cursor.com",
    "*.cursorusercontent.com",
  ],
};

export default nextConfig;
