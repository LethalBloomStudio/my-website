import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_SUPABASE_URL: "https://tlgjkouoriekakueizir.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "sb_publishable_9BVlb_gRuJh2fNOcw8yMZw_oNYl-THK",
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "tlgjkouoriekakueizir.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
