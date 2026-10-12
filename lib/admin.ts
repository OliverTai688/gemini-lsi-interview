// 後台管理者：由環境變數 ADMIN_EMAILS 指定（逗號分隔的 Google 帳號 email）

export function isAdminEmail(email?: string | null) {
  if (!email) return false;

  const admins = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  return admins.includes(email.toLowerCase());
}
