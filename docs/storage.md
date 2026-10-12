# 訪談儲存：Supabase + Cloudflare R2

## 架構

| 資料 | 放哪 | 說明 |
|---|---|---|
| User / Account / Session / Turn、摘要 JSON | Supabase Postgres | 經由 Prisma 存取 |
| 訪談錄音、白板影片、白板完成圖、白板筆畫、圖片 | R2 私有 bucket | DB 的 `Asset` 表只放 metadata 與 object key |

素材上傳不經過我們的 API 主機：

1. `POST /api/session/[id]/assets` → 建立 `PENDING` 的 Asset，回傳 R2 預簽 PUT 網址（10 分鐘有效）
2. 瀏覽器直接 `PUT` 到 R2
3. `PATCH /api/assets/[assetId]` → 伺服器確認檔案存在、檢查大小，標成 `READY`

讀取一律走 `GET /api/assets/[assetId]`：驗證擁有者後 302 轉址到 1 小時有效的 R2 網址，
可以直接當 `<audio>` / `<video>` / `<img>` 的 `src`，加 `?download=1` 變成下載。

R2 物件路徑：`sessions/<sessionId>/<kind>/<uuid>.<ext>`

### 素材種類

| kind | 內容 | 格式 | 上限 |
|---|---|---|---|
| `INTERVIEW_AUDIO` | 受訪者麥克風 + AI 語音混音，每 60 秒一段 | webm（Safari 為 m4a） | 50 MB / 段 |
| `INTERVIEW_AUDIO_MERGED` | 所有分段合併後的單一檔案，由伺服器產生（`POST /api/session/[id]/recording`） | 同分段 | — |
| `WHITEBOARD_VIDEO` | 白板繪製過程 + 解說音訊，1280×720 | mp4（不支援時 webm） | 500 MB |
| `WHITEBOARD_SNAPSHOT` | 白板完成圖 | png | 10 MB |
| `WHITEBOARD_STROKES` | 帶時間戳的筆畫事件，可重新算圖 | json | 20 MB |
| `IMAGE` | 受訪者上傳的圖片、或插入白板的圖片 | jpg / png / webp / gif | 15 MB |

同一次錄音的各分段、同一張白板的影片 / 完成圖 / 筆畫 / 插入圖片，共用同一個 `groupId`。

## 第一次設定

### 1. Supabase

1. 建立專案，區域選東京或新加坡。
2. Project Settings → Database → Connection string，填進 `.env`（格式見 `.env.example`）：
   - `DATABASE_URL`：Transaction pooler（port 6543），結尾加 `?pgbouncer=true&connection_limit=1`
   - `DIRECT_URL`：Session pooler 或 direct connection（port 5432）
3. 建表：

   ```bash
   pnpm exec prisma migrate deploy
   ```

Migration 會對所有資料表開啟 RLS 且不建立 policy。這個專案只透過 Prisma 存取資料，
這樣做是為了讓 Supabase 的 Data API（anon key）碰不到這些表。**不要關掉。**

### 2. Cloudflare R2

1. 建立 bucket（名稱填進 `R2_BUCKET`），Location hint 選 APAC，維持私有、不要開 public access。
2. R2 → Manage API Tokens → 建立 **Object Read & Write**、限定這個 bucket 的 token，
   把 Account ID / Access Key ID / Secret Access Key 填進 `.env`。
3. Bucket → Settings → CORS policy（瀏覽器直傳需要）：

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:3000", "https://<正式網域>"],
       "AllowedMethods": ["PUT", "GET", "HEAD"],
       "AllowedHeaders": ["content-type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

### 3. 搬舊資料（MongoDB → Postgres）

```bash
MONGODB_URL="mongodb+srv://..." npx tsx scripts/migrate-mongo-to-postgres.ts
```

- 沿用原本的 ObjectId 字串當主鍵，舊的 `/session/<id>` 網址不會失效。
- 可重複執行；MongoDB 上的資料不會被更動。
- `Turn.audioBase64` 不會搬（原本的存法無法可靠還原成音檔）。

## 排程：清理未完成的上傳

`GET /api/cron/cleanup-assets` 會刪掉超過 24 小時仍是 `PENDING` 的素材（資料列與 R2 上的檔案）。
需要帶 `Authorization: Bearer <CRON_SECRET>`，沒設 `CRON_SECRET` 時這支 API 一律回 401。
建議每天跑一次，用任何排程器都可以（Vercel Cron、GitHub Actions、cron-job.org…）：

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://<正式網域>/api/cron/cleanup-assets
```

## 錄音同意與刪除

- 第一次開始語音訪談或開白板前，會先跳出同意畫面；同意時間記在 `User.recordingConsentAt`。
  同意文字在 `messages/zh-TW.ts`、`messages/en.ts` 的 `consent`，**上線前請依實際的研究倫理 / 個資告知需求調整**。
- 訪談列表可以刪除整場訪談；素材庫（`/session/[id]/materials`）可以刪除單一白板或圖片。
  兩者都會同時刪掉 R2 上的檔案。

## Gemini 金鑰

`GOOGLE_API_KEY` 只在 server 使用。瀏覽器開始語音訪談前，會向
`POST /api/session/[id]/live-token` 要一個一次性的短效 token（60 秒內要連上、連線最長 60 分鐘）。
舊的 `NEXT_PUBLIC_GOOGLE_API_KEY` 已不再使用，請從部署環境的環境變數移除。

## 已知限制

- 訪談錄音是分段檔，播放器會接起來播，段與段交接處可能有極短的停頓。
- 分頁當掉或斷網時，最多損失最後一段（60 秒內）的錄音。
- 白板錄影單次上限 20 分鐘，到時間會自動完成並儲存。
- 產生訪談總結時最多附 8 張白板完成圖給模型。

## 尚未完成

1. **保存期限**：目前素材會一直保留到使用者自己刪除。要不要自動過期、保留多久，需要先決定政策。
2. **白板影片轉檔**：Chrome / Safari 錄出來已經是 mp4；Firefox 會是 webm，目前不轉檔。
3. **白板重播**：用 `WHITEBOARD_STROKES` 做可互動的重播（資料已經有存，只差播放介面）。
4. **白板自動說明文字**：每段白板存檔後自動產生一段文字描述。
5. **備份**：Supabase PITR 與 R2 bucket 的異地備份。
