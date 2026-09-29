import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output makes the app portable (Docker / any Node host) besides Vercel.
  output: "standalone",
  poweredByHeader: false,
  // Server-only packages that must not be bundled for the client.
  serverExternalPackages: ["postgres"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Microphone is required on the interview page only.
          { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
