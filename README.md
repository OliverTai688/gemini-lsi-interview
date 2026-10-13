# 生命故事訪談 Life Story Interview

由 AI 訪談員（Gemini Live）進行的生命故事語音訪談。研究者在後台為每位受訪者產生專屬連結，
受訪者點開連結、免登入就能完成整場訪談；過程會錄音，也可以用白板畫圖說明並錄成影片。

- **受訪者**：`/i/<token>`（專屬連結）→ 說明、稱呼、同意 → 訪談 → 完成頁
- **研究者**：Google 登入 → `/admin` 管理受訪者、查看逐字稿 / 素材 / AI 總結

技術：Next.js 16（App Router）、Prisma + Supabase Postgres、Cloudflare R2、NextAuth v5、Vercel。

## 文件

- [docs/deploy.md](docs/deploy.md) — 部署、CI/CD、環境變數
- [docs/storage.md](docs/storage.md) — 資料與素材怎麼存、R2 設定、舊資料搬遷
- [docs/ui-gaps.md](docs/ui-gaps.md) — 介面缺口分析與目前狀態

## 本機開發

```bash
cp .env.example .env      # 填入連線字串與金鑰
pnpm install
pnpm db:migrate
pnpm dev
```
