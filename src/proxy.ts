import type { NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/proxy";

/**
 * Next.js 16 Proxy (formerly Middleware). Runs before every matched request
 * to refresh the Supabase session and redirect based on auth state.
 *
 * Note: Server Actions and pages still verify the user themselves — the proxy
 * is a first line of defence, not the only one.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     * - common static asset extensions (images, fonts, etc.)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?|ttf|otf)$).*)",
  ],
};
