// CI 用：確認 public schema 的每一張表都開了 Row Level Security。
// Supabase 會把 public schema 透過 Data API 對外開放；新增資料表時忘了在 migration 加
// ALTER TABLE ... ENABLE ROW LEVEL SECURITY，那張表就會被 anon key 讀寫。
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const tables = await prisma.$queryRaw`
  SELECT relname AS name
  FROM pg_class
  WHERE relkind = 'r'
    AND relnamespace = 'public'::regnamespace
    AND NOT relrowsecurity
  ORDER BY relname
`;
await prisma.$disconnect();

if (tables.length > 0) {
  console.error("以下資料表沒有開啟 RLS，請在 migration 補上 ENABLE ROW LEVEL SECURITY：");
  for (const t of tables) console.error(`  ✗ ${t.name}`);
  process.exit(1);
}
console.log("✓ 所有資料表都已開啟 RLS");
