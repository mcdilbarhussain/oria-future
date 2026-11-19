/** @type {import('next').NextConfig} */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline'" + (process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""),
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://i.ebayimg.com https://*.ebayimg.com",
      "font-src 'self' data:",
      "connect-src 'self'",
      "frame-ancestors 'none'",
      "form-action 'self' https://auth.ebay.com https://auth.sandbox.ebay.com",
      "base-uri 'self'",
    ].join("; "),
  },
];

const nextConfig = {
  poweredByHeader: false,
  output: "standalone",
  serverExternalPackages: ["pdfkit", "exceljs", "pg", "bcryptjs"],
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // Files loaded dynamically by exceljs/pdfkit that the standalone tracer can miss
  outputFileTracingIncludes: {
    "/api/export/**": ["./node_modules/generator-function/**", "./node_modules/async-function/**", "./node_modules/pdfkit/js/data/**"],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
