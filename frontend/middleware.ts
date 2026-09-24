import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const PROTECTED_PREFIXES = [
  "/courses",
  "/optimization",
  "/upload",
  "/presenter",
  "/lesson-plans",
  "/analytics",
  "/export",
];

const AUTH_PAGES = ["/login", "/register"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("optilearn_token")?.value;
  const isAuthenticated = Boolean(token && token.trim().length > 0);

  // If user visits root "/" -> redirect to /courses or /login
  if (pathname === "/") {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL("/courses", request.url));
    }
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // If unauthenticated and trying to access a protected route
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (isProtected && !isAuthenticated) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // If authenticated and trying to access login/register -> redirect to /courses
  const isAuthPage = AUTH_PAGES.some((authPath) => pathname === authPath);
  if (isAuthPage && isAuthenticated) {
    return NextResponse.redirect(new URL("/courses", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, images, svg, icons
     */
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
