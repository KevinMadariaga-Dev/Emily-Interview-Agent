import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Standalone output makes the app portable (Docker / any Node host) besides Vercel.
  output: "standalone",
  poweredByHeader: false,
  // Server-only packages that must not be bundled for the client.
  serverExternalPackages: ["postgres", "nodemailer"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Microphone is required on the interview page only.
          { key: "Permissions-Policy", value: "microphone=(self), camera=()" },
          // No framing by other sites (clickjacking: a hidden "Start" over the mic prompt).
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        ],
      },
    ];
  },
};

export default nextConfig;
