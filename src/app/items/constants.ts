export type ActionResult<T = unknown> =
  | { success: true; message: string; data?: T }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

export const ALLOWED_ITEM_STATUSES = [
  "Available",
  "Lent Out",
  "In Laundry",
] as const;

export type ItemStatus = (typeof ALLOWED_ITEM_STATUSES)[number];

export const ALLOWED_ITEM_TAGS = [
  "Casual",
  "Formal",
  "Vintage",
  "Streetwear",
  "Workwear",
  "Athletic",
  "Lounge",
] as const;

export type ItemTag = (typeof ALLOWED_ITEM_TAGS)[number];

/**
 * Extracts the storage object path inside a Supabase storage bucket from a public URL.
 * Example input:
 *   "https://xyz.supabase.co/storage/v1/object/public/wardrobe/abc-123/1728938192-abc.jpg"
 * Output:
 *   "abc-123/1728938192-abc.jpg"
 */
export function extractStoragePath(
  imageUrl: string,
  bucketName: string = "wardrobe"
): string | null {
  if (!imageUrl || typeof imageUrl !== "string") return null;

  try {
    const url = new URL(imageUrl);
    const pathname = decodeURIComponent(url.pathname);
    const marker = `/${bucketName}/`;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex !== -1) {
      return pathname.substring(markerIndex + marker.length);
    }
    const parts = pathname.split("/").filter(Boolean);
    const bucketIndex = parts.indexOf(bucketName);
    if (bucketIndex !== -1 && bucketIndex < parts.length - 1) {
      return parts.slice(bucketIndex + 1).join("/");
    }
  } catch {
    const marker = `${bucketName}/`;
    const idx = imageUrl.indexOf(marker);
    if (idx !== -1) {
      return imageUrl.substring(idx + marker.length);
    }
  }
  return null;
}
