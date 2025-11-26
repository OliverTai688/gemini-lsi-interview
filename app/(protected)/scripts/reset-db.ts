import { prisma } from "@/lib/prisma";

async function main() {
  await prisma.turn.deleteMany({});
  await prisma.session.deleteMany({});

  console.log("✅ MongoDB 已清空 Session / Turn");
}

main().then(() => process.exit(0));
