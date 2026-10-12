# 部署與 CI/CD（Vercel + GitHub Actions）

## 流程

```
push / PR ──▶ GitHub Actions（.github/workflows/ci.yml）
               安裝 → 套用 migration 到空的 Postgres → 檢查 schema 與 migration 一致
               → 檢查每張表都開了 RLS → lint → typecheck → build

合併到 main ──▶ Vercel production 建置（pnpm run vercel-build）
               1. scripts/predeploy.mjs：檢查環境變數，缺的一次列出來並中止
               2. scripts/predeploy.mjs：prisma migrate deploy（只有 production 會跑）
               3. prisma generate → next build → 上線

其他分支 ──▶ Vercel preview 建置：同上，但不會動資料庫
```

資料庫 migration 是部署的一部分：migration 失敗，那次部署就不會上線。

每天台灣時間 03:00，Vercel Cron 會呼叫 `/api/cron/cleanup-assets` 清掉沒傳完的素材
（Vercel 會自動帶上 `CRON_SECRET`）。

## 第一次上線要做的事

程式與設定都在 repo 裡了，剩下的是只有你能做的帳號與金鑰：

1. **Supabase**：建立專案（區域選東京），取得兩條連線字串。
2. **Cloudflare R2**：建立 bucket、API token、設定 CORS（步驟見 [storage.md](storage.md)）。
3. **Google Cloud**
   - OAuth client（Web application），Authorized redirect URI 填
     `https://<正式網域>/api/auth/callback/google`
   - Gemini API key
4. **OpenAI**：API key（產生訪談總結用）。
5. **Vercel**：Add New → Project → 匯入這個 GitHub repo，在 Environment Variables 填入下表，然後 Deploy。
6. 部署完成後，用 `ADMIN_EMAILS` 裡的 Google 帳號登入 → 進 `/admin` → 新增受訪者 → 把專屬連結傳給對方。

### 環境變數

| 變數 | 內容 |
|---|---|
| `DATABASE_URL` | Supabase **Transaction pooler**（port 6543），結尾加 `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Supabase **Session pooler**（port 5432），migration 用 |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET` | Cloudflare R2 |
| `AUTH_SECRET` | `openssl rand -base64 32` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth（只有研究者登入會用到） |
| `ADMIN_EMAILS` | 可以進後台的 Google 帳號，逗號分隔 |
| `GOOGLE_API_KEY` | Gemini API key（只在 server 使用） |
| `OPENAI_API_KEY` | OpenAI API key |
| `CRON_SECRET` | `openssl rand -hex 32` |

少填任何一個，建置會在第一步就停下來並列出缺哪些，不會部署出一個壞掉的版本。

### 注意

- `vercel.json` 的 `regions` 是 `hnd1`（東京）。Supabase 若選新加坡，改成 `sin1`，讓主機與資料庫在同一區。
- Preview 部署如果和正式環境共用同一個資料庫，preview 上的操作會寫進正式資料。
  要完全隔離的話，在 Vercel 把 Preview 環境的 `DATABASE_URL` / `DIRECT_URL` 指到另一個 Supabase 專案。
- 建議在 GitHub 的 branch protection 把 `CI / check` 設為合併到 main 的必要條件。
- 新增資料表時，migration 裡要加 `ALTER TABLE "<表名>" ENABLE ROW LEVEL SECURITY;`，否則 CI 會擋下來。

### 模型

| 用途 | 預設 | 環境變數 |
|---|---|---|
| 語音訪談員 | `gemini-3.8-live` | `GEMINI_LIVE_MODEL` |
| 訪談總結（每場一次） | `gpt-6.1-sol` | `OPENAI_SUMMARY_MODEL` |
| 進度判斷（每回合一次） | `gpt-6-luna` | `OPENAI_PROGRESS_MODEL` |

換型號只要改環境變數並重新部署。型號會被供應商下架，預設值若失效，先在這裡覆蓋。

語音連線被拒時可以試著設 `GEMINI_LIVE_API_VERSION=v1alpha`：官方文件目前要求短效 token 使用預設版本（v1beta），
但 SDK 內仍留有舊版只支援 v1alpha 的說明，這個變數是兩者不一致時的退路。

### 合併錄音（ffmpeg）

素材庫的「合併成單一檔案」會在伺服器上執行 ffmpeg。執行檔來自 `ffmpeg-static` 套件，
安裝依賴時自動下載，`next.config.ts` 會把它一起打包進那支 API。
自架主機或本機想用系統的 ffmpeg，可以設 `FFMPEG_PATH`。

## 本機開發

```bash
cp .env.example .env      # 填入連線字串與金鑰
pnpm install
pnpm db:migrate
pnpm dev
```
