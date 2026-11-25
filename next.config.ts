import type { NextConfig } from "next";

/**
 * Identifies this build. The TV display polls `/api/version` and reloads itself
 * when the id changes, and the service worker uses it to version its caches.
 * Set BUILD_ID (for example to the git commit) for reproducible deployments.
 */
const buildId =
  process.env.BUILD_ID ||
  process.env.GIT_COMMIT_SHA?.slice(0, 12) ||
  `b${Date.now().toString(36)}`;

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,

  // NEXT_DIST_DIR lets several dev servers or test builds run side by side.
  distDir: process.env.NEXT_DIST_DIR || ".next",

  // `NEXT_OUTPUT=standalone` produces a self-contained server for Docker.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,

  generateBuildId: async () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },

  poweredByHeader: false,

  experimental: {
    serverActions: {
      // Timetable spreadsheets are uploaded through a Server Action.
      bodySizeLimit: "6mb",
    },
  },

  turbopack: {
    rules: {
      "*.css": {
        // CSS Modules keep Next's own handling: sent through the Tailwind
        // loader they would be compiled as global CSS with no exports.
        condition: { not: { path: /\.module\.css$/ } },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
      {
        // The admin area must never be framed. The TV page is left frameable
        // on purpose so digital-signage players can embed it.
        source: "/admin/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Cache-Control", value: "no-store" },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
    ];
  },
};

export default nextConfig;
