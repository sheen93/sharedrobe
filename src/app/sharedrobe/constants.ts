export const BORROW_DURATION_OPTIONS = [
  "Just for the weekend",
  "A couple of weeks",
  "Until you notice it's missing",
  "Infinity (It looks better on me anyway)",
] as const;

export type BorrowDurationOption = (typeof BORROW_DURATION_OPTIONS)[number];

export const BORROW_REQUEST_STATUSES = [
  "pending",
  "approved",
  "rejected",
  "returned",
] as const;

export type BorrowRequestStatus = (typeof BORROW_REQUEST_STATUSES)[number];

export const CIRCLE_ACTIVITY_TYPES = [
  "shared_item",
  "borrowed_item",
  "public_nudge",
  "shared_outfit",
  "sos_request",
  "sos_suggestion",
] as const;

export type CircleActivityType = (typeof CIRCLE_ACTIVITY_TYPES)[number];

export const SOS_REQUEST_STATUSES = [
  "active",
  "fulfilled",
  "cancelled",
] as const;

export type SosRequestStatus = (typeof SOS_REQUEST_STATUSES)[number];

export const SOS_SUGGESTION_STATUSES = [
  "suggested",
  "accepted",
  "declined",
] as const;

export type SosSuggestionStatus = (typeof SOS_SUGGESTION_STATUSES)[number];

export const NUDGE_RETURN_TYPES = ["private", "public"] as const;
export type NudgeReturnType = (typeof NUDGE_RETURN_TYPES)[number];

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: unknown): id is string {
  return typeof id === "string" && UUID_REGEX.test(id.trim());
}

export function isValidBorrowDuration(
  duration: unknown
): duration is BorrowDurationOption {
  return (
    typeof duration === "string" &&
    (BORROW_DURATION_OPTIONS as readonly string[]).includes(duration.trim())
  );
}

export function isValidNudgeType(type: unknown): type is NudgeReturnType {
  return (
    typeof type === "string" &&
    (NUDGE_RETURN_TYPES as readonly string[]).includes(type)
  );
}

export function formatPublicNudgeMessage(
  borrowerName: string,
  itemTitle: string,
  ownerName?: string
): string {
  const safeBorrower = borrowerName.trim() || "Bestie";
  const safeItem = itemTitle.trim() || " that piece";
  const ownerClause = ownerName?.trim()
    ? ` (${ownerName.trim()} is officially calling you out 👀)`
    : "";
  return `🚨 Targeting ${safeBorrower}, time to give "${safeItem}" back!${ownerClause}`;
}

export function isValidSosDescription(desc: unknown): desc is string {
  if (typeof desc !== "string") return false;
  const trimmed = desc.trim();
  return trimmed.length >= 3 && trimmed.length <= 500;
}

export function isValidSosTargetDate(dateStr: unknown): dateStr is string {
  if (typeof dateStr !== "string") return false;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const parsed = new Date(trimmed);
  return !isNaN(parsed.getTime());
}

export function formatSosRequestActivityMessage(
  requesterName: string,
  eventDescription: string
): string {
  const safeRequester = requesterName.trim() || "A circle bestie";
  const safeDesc = eventDescription.trim();
  return `🚨 SOS Alert: ${safeRequester} needs an outfit for "${safeDesc}"!`;
}

export function formatSosSuggestionActivityMessage(
  suggesterName: string,
  itemTitle: string
): string {
  const safeSuggester = suggesterName.trim() || "A circle bestie";
  const safeItem = itemTitle.trim() || "a garment";
  return `✨ ${safeSuggester} suggested "${safeItem}" for the SOS request!`;
}
