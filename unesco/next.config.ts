import type { NextConfig } from "next";
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// Build ID: deploy 시마다 변경. 클라이언트가 tab focus 시 비교하여 새 버전이면 reload.
const buildId = process.env.VERCEL_GIT_COMMIT_SHA || Date.now().toString();

try {
  mkdirSync(join(__dirname, "public"), { recursive: true });
  writeFileSync(join(__dirname, "public", "build-id.txt"), buildId);
} catch {
  /* ignore */
}

const nextConfig: NextConfig = {
  output: "export",
  devIndicators: false,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
};
export default nextConfig;
