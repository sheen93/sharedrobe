import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getSupabaseEnv } from "./env";

/** Routes reachable without a session. Everything else requires auth. */
const PUBLIC_PATH_PREFIXES = ["/login", "/auth"] as const;

/** Routes a signed-in user should be bounced away from. */
const GUEST_ONLY_PATHS = ["/login"] as const;

function matchesPrefix(pathname: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Headers @supabase/ssr asks us to forward so auth responses aren't cached. */
const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

/**
 * Build a redirect that preserves any refreshed auth cookies (and their
 * no-cache headers) from the pass-through response; otherwise the browser and
 * server sessions drift apart and the user is signed out unexpectedly.
 */
function redirectPreservingSession(
  request: NextRequest,
  source: NextResponse,
  pathname: string
): NextResponse {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  url.search = "";

  const response = NextResponse.redirect(url);
  source.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  CACHE_HEADERS.forEach((header) => {
    const value = source.headers.get(header);
    if (value) response.headers.set(header, value);
  });
  return response;
}

/**
 * Refreshes the Supabase session cookie on every matched request and enforces
 * route-level access. Called from src/proxy.ts.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { url, anonKey } = getSupabaseEnv();
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value)
        );
      },
    },
  });

  // IMPORTANT: keep getUser() immediately after creating the client. It
  // revalidates the JWT with Supabase Auth (unlike getSession(), which only
  // reads the cookie) and triggers the token refresh written via setAll().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!user && !matchesPrefix(pathname, PUBLIC_PATH_PREFIXES)) {
    return redirectPreservingSession(request, supabaseResponse, "/login");
  }

  if (user && matchesPrefix(pathname, GUEST_ONLY_PATHS)) {
    return redirectPreservingSession(request, supabaseResponse, "/");
  }

  return supabaseResponse;
}
