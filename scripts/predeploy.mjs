// Vercel 建置前執行（package.json 的 vercel-build）：
//   1. 檢查必要的環境變數，缺的一次列出來
//   2. 正式環境（production）才套用資料庫 migration；preview 不動資料庫
import { execSync } from "node:child_process";

const REQUIRED = [
  ["DATABASE_URL", "Supabase Transaction pooler 連線字串（port 6543）"],
  ["DIRECT_URL", "Supabase Session pooler 連線字串（port 5432）"],
  ["R2_ACCOUNT_ID", "Cloudflare 帳號 ID"],
  ["R2_ACCESS_KEY_ID", "R2 API token"],
  ["R2_SECRET_ACCESS_KEY", "R2 API token"],
  ["R2_BUCKET", "R2 bucket 名稱"],
  ["AUTH_SECRET", "openssl rand -base64 32"],
  ["GOOGLE_CLIENT_ID", "Google OAuth"],
  ["GOOGLE_CLIENT_SECRET", "Google OAuth"],
  ["ADMIN_EMAILS", "可以進後台的 Google 帳號，逗號分隔"],
  ["GOOGLE_API_KEY", "Gemini API key"],
  ["OPENAI_API_KEY", "OpenAI API key（產生訪談總結）"],
  ["CRON_SECRET", "排程清理用；openssl rand -hex 32"],
];

const problems = [];
for (const [name, hint] of REQUIRED) {
  const value = process.env[name];
  if (!value) problems.push(`  ✗ ${name} 未設定 — ${hint}`);
  else if (/[<>]/.test(value)) problems.push(`  ✗ ${name} 還是範本的佔位內容 — ${hint}`);
}

// 兩條資料庫連線字串必須是 Postgres（最常見的錯誤是留著舊的 MongoDB 連線字串）
for (const name of ["DATABASE_URL", "DIRECT_URL"]) {
  const value = process.env[name];
  if (!value || /[<>]/.test(value)) continue; // 上面已經列過了

  if (/^mongodb(\+srv)?:\/\//i.test(value)) {
    problems.push(`  ✗ ${name} 還是 MongoDB 的連線字串 — 請換成 Supabase 的 Postgres 連線字串`);
  } else if (!/^postgres(ql)?:\/\//i.test(value)) {
    problems.push(`  ✗ ${name} 不是 Postgres 連線字串 — 開頭應該是 postgresql://`);
  }
}

if (problems.length > 0) {
  console.error("\n部署中止：以下環境變數需要在 Vercel 專案設定裡補上\n");
  console.error(problems.join("\n"));
  console.error("\n設定位置：Vercel → Project → Settings → Environment Variables\n");
  process.exit(1);
}
console.log("✓ 環境變數檢查通過");

// 走 Supabase Transaction pooler（port 6543）卻沒加 pgbouncer=true，Prisma 執行查詢時會出錯
const databaseUrl = process.env.DATABASE_URL;
if (/:6543\b/.test(databaseUrl) && !/[?&]pgbouncer=true\b/.test(databaseUrl)) {
  console.warn("⚠ DATABASE_URL 使用 port 6543（Transaction pooler），結尾請加上 ?pgbouncer=true&connection_limit=1");
}

if (process.env.VERCEL_ENV === "production") {
  console.log("→ 套用資料庫 migration（prisma migrate deploy）");
  execSync("prisma migrate deploy", { stdio: "inherit" });
} else {
  console.log(`→ 略過資料庫 migration（VERCEL_ENV=${process.env.VERCEL_ENV ?? "未設定"}，只有 production 會套用）`);
}
