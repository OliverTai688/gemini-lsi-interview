import { prisma } from "@/lib/prisma";

// 注意：只清資料列，R2 上的素材檔不會被刪
async function main() {
  await prisma.asset.deleteMany({});
  await prisma.turn.deleteMany({});
  await prisma.session.deleteMany({});

  console.log("✅ 已清空 Session / Turn / Asset");
}

main().then(() => process.exit(0));
