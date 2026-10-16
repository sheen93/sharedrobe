import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseEnv } from "./env";

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

/**
 * Supabase client for Client Components (browser).
 * Implemented as a singleton to avoid lock contention (`navigator.locks`)
 * and redundant client re-instantiations across renders.
 */
export function createClient() {
  if (browserClient) return browserClient;

  const { url, anonKey } = getSupabaseEnv();
  browserClient = createBrowserClient(url, anonKey);
  return browserClient;
}
