import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ffmpeg-static 是一個執行檔，不能被打包；合併錄音的 API 需要把它一起帶上部署
  serverExternalPackages: ["ffmpeg-static"],
  outputFileTracingIncludes: {
    "/api/session/[id]/recording": ["./node_modules/ffmpeg-static/ffmpeg"],
  },
};

export default nextConfig;
