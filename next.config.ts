import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // pin the workspace root to this app (there are lockfiles higher up on the dev machine)
  turbopack: { root: path.resolve(".") },
};

export default nextConfig;
