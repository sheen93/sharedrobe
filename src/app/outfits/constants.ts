export const OUTFIT_VISIBILITIES = ["private", "circle_public"] as const;
export type OutfitVisibility = (typeof OUTFIT_VISIBILITIES)[number];

export const OUTFIT_VOTE_TYPES = ["yay", "nay"] as const;
export type OutfitVoteType = (typeof OUTFIT_VOTE_TYPES)[number];

export const MIN_OUTFIT_TITLE_LENGTH = 2;
export const MAX_OUTFIT_TITLE_LENGTH = 80;
export const MIN_OUTFIT_ITEMS = 1;
export const MAX_OUTFIT_ITEMS = 12;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

export function isValidOutfitTitle(title: unknown): title is string {
  if (typeof title !== "string") return false;
  const trimmed = title.trim();
  return (
    trimmed.length >= MIN_OUTFIT_TITLE_LENGTH &&
    trimmed.length <= MAX_OUTFIT_TITLE_LENGTH
  );
}

export function isValidOutfitVisibility(
  visibility: unknown
): visibility is OutfitVisibility {
  return (
    typeof visibility === "string" &&
    (OUTFIT_VISIBILITIES as readonly string[]).includes(visibility.trim())
  );
}

export function isValidOutfitVote(vote: unknown): vote is OutfitVoteType {
  return (
    typeof vote === "string" &&
    (OUTFIT_VOTE_TYPES as readonly string[]).includes(vote.trim())
  );
}

/**
 * Deduplicates and validates an array of item UUID strings while preserving order.
 */
export function deduplicateItemIds(itemIds: unknown): string[] {
  if (!Array.isArray(itemIds)) return [];
  const seen = new Set<string>();
  const validIds: string[] = [];

  for (const rawId of itemIds) {
    if (!isValidUuid(rawId)) continue;
    const normalized = rawId.trim();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      validIds.push(normalized);
    }
  }

  return validIds;
}

/**
 * Pure helper that filters outfit items to only those NOT owned by currentUserId.
 */
export function filterNonOwnedOutfitItems<
  T extends { id: string; owner_id: string; status?: string },
>(items: T[], currentUserId: string): T[] {
  if (!Array.isArray(items) || !isValidUuid(currentUserId)) return [];
  const trimmedUser = currentUserId.trim();
  return items.filter(
    (item) =>
      item &&
      isValidUuid(item.id) &&
      isValidUuid(item.owner_id) &&
      item.owner_id.trim() !== trimmedUser
  );
}

/**
 * Formats a playful Drama Feed message when a creator drops a Lookbook for Yay/Nay voting.
 */
export function formatSharedOutfitMessage(
  creatorName: string,
  outfitTitle: string,
  itemCount: number
): string {
  const safeCreator = creatorName.trim() || "A circle bestie";
  const safeTitle = outfitTitle.trim() || "New Lookbook";
  const pieceLabel = itemCount === 1 ? "1 piece" : `${itemCount} pieces`;
  return `✨ ${safeCreator} dropped a new lookbook "${safeTitle}" (${pieceLabel}) — cast your Yay or Nay!`;
}
