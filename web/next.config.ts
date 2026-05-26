import type { NextConfig } from "next";

// Defence-in-depth headers. None of these change app behaviour for honest
// traffic, but they harden against clickjacking, MIME sniffing, and
// information leakage to third parties. A strict Content-Security-Policy
// would require nonce-injecting middleware (Next.js streams inline scripts
// for hydration), so it's left as a follow-up.
const SECURITY_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
    ];
  },
};

export default nextConfig;
