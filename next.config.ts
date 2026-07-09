import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // firebase-admin usa internals de Node (crypto, grpc, etc.) que no deben
  // ser bundleificados por webpack. Esto fuerza a Next.js a cargarlo como
  // módulo externo desde node_modules en runtime (resuelve el error
  // "Cannot read properties of undefined (reading 'cert')" en Vercel).
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
