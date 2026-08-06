import { networkInterfaces } from "node:os";

/** @type {import('next').NextConfig} */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const staticExport = process.env.NEXT_STATIC_EXPORT === "1";

/** Non-loopback IPv4 addresses so phones on the same Wi‑Fi can load /_next assets. */
const lanDevOrigins = Object.values(networkInterfaces())
  .flatMap((addrs) => addrs ?? [])
  .filter((addr) => addr.family === "IPv4" && !addr.internal)
  .map((addr) => addr.address);

const nextConfig = {
  ...(staticExport ? { output: "export" } : {}),
  allowedDevOrigins: lanDevOrigins,
  basePath,
  assetPrefix: basePath ? `${basePath}/` : undefined,
  transpilePackages: [
    "@weavo/client",
    "@weavo/core",
    "@weavo/sync",
    "@weavo/transport",
  ],
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
