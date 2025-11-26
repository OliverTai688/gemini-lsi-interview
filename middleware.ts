import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// 不需登入即可訪問的路由
const PUBLIC_PATHS = [
  "/auth/login",
  "/auth/error",
  "/auth/verify-request",
  "/favicon.ico",
];

const ONBOARDING_PATH = "/auth/onboarding";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 排除 Next.js 靜態資源
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(jpg|jpeg|png|gif|svg|ico|css|js)$/)
  ) {
    return NextResponse.next();
  }

  // Public routes，不需驗證
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // 從 cookie 讀取 JWT（node runtime）
  const token = await getToken({ req, secret: process.env.AUTH_SECRET });

// 沒登入
if (!token) {
  return NextResponse.redirect(new URL("/auth/login", req.url));
}

// 尚未 onboarding
if (!token.onboardingCompleted) {
  if (pathname.startsWith("/auth/onboarding")) {
    return NextResponse.next();
  }
  return NextResponse.redirect(new URL("/auth/onboarding", req.url));
}

return NextResponse.next();

}
export const config = {
  matcher: [
    "/((?!api/auth|auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
