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
] as const;

export type CircleActivityType = (typeof CIRCLE_ACTIVITY_TYPES)[number];

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
