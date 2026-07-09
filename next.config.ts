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
  // módulo externo desde node_modules en runtime.
  serverExternalPackages: ["firebase-admin"],
  // Fuerza a Next.js a incluir TODOS los archivos de firebase-admin en el
  // bundle serverless (no solo los que detecta por análisis estático).
  // Sin esto, los subpath imports como 'firebase-admin/firestore' y
  // 'firebase-admin/auth' no se incluyen y fallan en runtime con
  // "Cannot find module '/var/task/node_modules/firebase-admin/lib/firestore/index.js'"
  outputFileTracingIncludes: {
    "/api/**": ["./node_modules/firebase-admin/**/*"],
  },
};

export default nextConfig;
