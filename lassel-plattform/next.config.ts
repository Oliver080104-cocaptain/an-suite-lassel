import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Externe Bilder (z.B. Firmenlogo von Supabase Storage)
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ntknhomlvvododhtrret.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },

  // Verhindert dass Server-only Module (fs, path) im Browser landen
  serverExternalPackages: ["papaparse"],
};

export default nextConfig;
