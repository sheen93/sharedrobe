/**
 * Public Supabase configuration.
 *
 * `NEXT_PUBLIC_*` variables are inlined at build time, so they must be
 * referenced directly (not via dynamic keys) for Next.js to replace them.
 */
export function getSupabaseEnv(): { url: string; anonKey: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local (see docs/AUTH.md)."
    );
  }

  return { url, anonKey };
}
