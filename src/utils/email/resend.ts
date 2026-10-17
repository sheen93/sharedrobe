import { Resend } from "resend";

let resendInstance: Resend | null = null;

/**
 * Safely resolves the Resend client instance.
 * Returns null if RESEND_API_KEY is not configured in the environment.
 */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || apiKey.trim() === "") {
    return null;
  }
  if (!resendInstance) {
    resendInstance = new Resend(apiKey.trim());
  }
  return resendInstance;
}

export interface SendFriendRequestEmailParams {
  toEmail: string;
  toName: string;
  fromName: string;
  appUrl?: string;
}

export interface SendCircleJoinRequestEmailParams {
  adminEmail: string;
  adminName: string;
  requesterName: string;
  circleName: string;
  appUrl?: string;
}

export interface EmailSendResult {
  success: boolean;
  skipped?: boolean;
  error?: string;
  id?: string;
}

const DEFAULT_FROM = process.env.RESEND_FROM_EMAIL || "Share Drobe <onboarding@resend.dev>";

/**
 * Sends a clean, Stitch-styled transactional HTML email notifying a user of a friend request.
 */
export async function sendFriendRequestEmail(
  params: SendFriendRequestEmailParams
): Promise<EmailSendResult> {
  const client = getResendClient();
  if (!client) {
    console.warn(
      "[Resend] RESEND_API_KEY is not configured. Friend request email notification skipped."
    );
    return { success: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }

  const { toEmail, toName, fromName, appUrl = "https://sharedrobe.app" } = params;
  const targetUrl = `${appUrl.replace(/\/$/, "")}/sharedrobe`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Friend Request on Share Drobe</title>
</head>
<body style="margin: 0; padding: 24px 16px; background-color: #FCFBF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #121926;">
  <div style="max-width: 460px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E2D6; border-radius: 24px; padding: 32px 24px; box-shadow: 0 4px 16px rgba(29, 42, 68, 0.04);">
    <div style="display: inline-block; background-color: #1D2A44; color: #FFFFFF; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 10px; border-radius: 6px; margin-bottom: 16px;">
      COMMUNITY // CIRCULATION
    </div>
    <h1 style="color: #121926; font-size: 20px; font-weight: 700; margin: 0 0 12px; line-height: 1.3;">
      ${escapeHtml(fromName)} wants to connect!
    </h1>
    <p style="color: #475467; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi ${escapeHtml(toName)}, <strong>${escapeHtml(fromName)}</strong> has sent you a friend request on <strong>Share Drobe</strong>. Connect with them to share curated wardrobe collections and circular closet circles.
    </p>
    <div style="margin: 24px 0 16px;">
      <a href="${escapeHtml(targetUrl)}" style="display: inline-block; background-color: #1D2A44; color: #FFFFFF; font-size: 13px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 12px;">
        View & Respond in Share Drobe →
      </a>
    </div>
    <p style="color: #64748B; font-size: 12px; line-height: 1.5; margin: 24px 0 0; padding-top: 16px; border-top: 1px solid #F0EFE9;">
      Share Drobe is a circular closet network for minimalists. If you didn't expect this request, you can safely decline it in your dashboard.
    </p>
  </div>
</body>
</html>
  `.trim();

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [toEmail],
      subject: `${fromName} sent you a friend request on Share Drobe`,
      html,
    });

    if (error) {
      console.warn("[Resend Error] Failed to send friend request email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown Resend error";
    console.warn("[Resend Exception] Error sending friend request email:", message);
    return { success: false, error: message };
  }
}

/**
 * Sends a transactional HTML email notifying circle admins of a new join request.
 */
export async function sendCircleJoinRequestEmail(
  params: SendCircleJoinRequestEmailParams
): Promise<EmailSendResult> {
  const client = getResendClient();
  if (!client) {
    console.warn(
      "[Resend] RESEND_API_KEY is not configured. Circle join request email notification skipped."
    );
    return { success: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }

  const { adminEmail, adminName, requesterName, circleName, appUrl = "https://sharedrobe.app" } = params;
  const targetUrl = `${appUrl.replace(/\/$/, "")}/sharedrobe`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Circle Member Request</title>
</head>
<body style="margin: 0; padding: 24px 16px; background-color: #FCFBF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #121926;">
  <div style="max-width: 460px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E2D6; border-radius: 24px; padding: 32px 24px; box-shadow: 0 4px 16px rgba(29, 42, 68, 0.04);">
    <div style="display: inline-block; background-color: #9683B8; color: #FFFFFF; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 10px; border-radius: 6px; margin-bottom: 16px;">
      CIRCLES // ACCESS REQUEST
    </div>
    <h1 style="color: #121926; font-size: 20px; font-weight: 700; margin: 0 0 12px; line-height: 1.3;">
      New member request for ${escapeHtml(circleName)}
    </h1>
    <p style="color: #475467; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi ${escapeHtml(adminName)}, <strong>${escapeHtml(requesterName)}</strong> has requested to join your circle <strong>"${escapeHtml(circleName)}"</strong>. As an admin, you can approve or decline their access.
    </p>
    <div style="margin: 24px 0 16px;">
      <a href="${escapeHtml(targetUrl)}" style="display: inline-block; background-color: #1D2A44; color: #FFFFFF; font-size: 13px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 12px;">
        Review Request in Share Drobe →
      </a>
    </div>
    <p style="color: #64748B; font-size: 12px; line-height: 1.5; margin: 24px 0 0; padding-top: 16px; border-top: 1px solid #F0EFE9;">
      Manage your circles and shared wardrobe permissions anytime inside Share Drobe.
    </p>
  </div>
</body>
</html>
  `.trim();

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [adminEmail],
      subject: `${requesterName} wants to join ${circleName} on Share Drobe`,
      html,
    });

    if (error) {
      console.warn("[Resend Error] Failed to send circle join request email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown Resend error";
    console.warn("[Resend Exception] Error sending circle join request email:", message);
    return { success: false, error: message };
  }
}

export interface SendCircleAddedNotificationEmailParams {
  friendEmail: string;
  friendName: string;
  circleName: string;
  addedByName: string;
  appUrl?: string;
}

/**
 * Sends a clean, Stitch-styled transactional HTML email notifying a friend that they
 * were added to a sharing circle by a circle admin.
 */
export async function sendCircleAddedNotificationEmail(
  params: SendCircleAddedNotificationEmailParams
): Promise<EmailSendResult> {
  const client = getResendClient();
  if (!client) {
    console.warn(
      "[Resend] RESEND_API_KEY is not configured. Circle member added email notification skipped."
    );
    return { success: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }

  const {
    friendEmail,
    friendName,
    circleName,
    addedByName,
    appUrl = "https://sharedrobe.app",
  } = params;
  const targetUrl = `${appUrl.replace(/\/$/, "")}/sharedrobe`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>You've been added to ${escapeHtml(circleName)}</title>
</head>
<body style="margin: 0; padding: 24px 16px; background-color: #FCFBF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #121926;">
  <div style="max-width: 460px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E2D6; border-radius: 24px; padding: 32px 24px; box-shadow: 0 4px 16px rgba(29, 42, 68, 0.04);">
    <div style="display: inline-block; background-color: #1D2A44; color: #FFFFFF; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 10px; border-radius: 6px; margin-bottom: 16px;">
      COMMUNITY // CIRCLE MEMBER
    </div>
    <h1 style="color: #121926; font-size: 20px; font-weight: 700; margin: 0 0 12px; line-height: 1.3;">
      You're now in ${escapeHtml(circleName)}!
    </h1>
    <p style="color: #475467; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hi ${escapeHtml(friendName)}, <strong>${escapeHtml(addedByName)}</strong> added you to the sharing circle <strong>${escapeHtml(circleName)}</strong> on <strong>Share Drobe</strong>. You can now browse shared garments, lend wardrobe items, and borrow circular collections.
    </p>
    <div style="margin: 24px 0 16px;">
      <a href="${escapeHtml(targetUrl)}" style="display: inline-block; background-color: #1D2A44; color: #FFFFFF; font-size: 13px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 12px;">
        Explore Circle Wardrobe →
      </a>
    </div>
    <p style="color: #64748B; font-size: 12px; line-height: 1.5; margin: 24px 0 0; padding-top: 16px; border-top: 1px solid #F0EFE9;">
      Manage your circles and shared wardrobe permissions anytime inside Share Drobe.
    </p>
  </div>
</body>
</html>
  `.trim();

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [friendEmail],
      subject: `You've been added to ${circleName} on Share Drobe`,
      html,
    });

    if (error) {
      console.warn("[Resend Error] Failed to send circle added email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown Resend error";
    console.warn("[Resend Exception] Error sending circle added email:", message);
    return { success: false, error: message };
  }
}

export interface SendReturnNudgeEmailParams {
  borrowerEmail: string;
  borrowerName: string;
  ownerName: string;
  itemTitle: string;
  appUrl?: string;
}

/**
 * Sends a playful, friendly private nudge email asking a borrower to return a lent-out garment.
 */
export async function sendReturnNudgeEmail(
  params: SendReturnNudgeEmailParams
): Promise<EmailSendResult> {
  const client = getResendClient();
  if (!client) {
    console.warn(
      "[Resend] RESEND_API_KEY is not configured. Private return nudge email skipped."
    );
    return { success: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }

  const {
    borrowerEmail,
    borrowerName,
    ownerName,
    itemTitle,
    appUrl = "https://sharedrobe.app",
  } = params;
  const targetUrl = `${appUrl.replace(/\/$/, "")}/sharedrobe`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Friendly Closet Nudge: ${escapeHtml(itemTitle)}</title>
</head>
<body style="margin: 0; padding: 24px 16px; background-color: #FCFBF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #121926;">
  <div style="max-width: 460px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E2D6; border-radius: 24px; padding: 32px 24px; box-shadow: 0 4px 16px rgba(29, 42, 68, 0.04);">
    <div style="display: inline-block; background-color: #9683B8; color: #FFFFFF; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 10px; border-radius: 6px; margin-bottom: 16px;">
      CLOSET NUDGE // KEEP IT PRIVATE 💌
    </div>
    <h1 style="color: #121926; font-size: 20px; font-weight: 700; margin: 0 0 12px; line-height: 1.3;">
      Psst... time for a closet reunion! ✨
    </h1>
    <p style="color: #475467; font-size: 14px; line-height: 1.6; margin: 0 0 20px;">
      Hey ${escapeHtml(borrowerName)}, <strong>${escapeHtml(ownerName)}</strong> sent a gentle, drama-free private nudge about <strong>"${escapeHtml(itemTitle)}"</strong>. Whenever you're done serving looks in it, their closet is ready to welcome it home!
    </p>
    <div style="margin: 24px 0 16px;">
      <a href="${escapeHtml(targetUrl)}" style="display: inline-block; background-color: #1D2A44; color: #FFFFFF; font-size: 13px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 12px;">
        Open Share Drobe →
      </a>
    </div>
    <p style="color: #64748B; font-size: 12px; line-height: 1.5; margin: 24px 0 0; padding-top: 16px; border-top: 1px solid #F0EFE9;">
      Thanks for keeping the circle wardrobe spinning! (Sent privately so we didn't have to sound the public siren 🚨)
    </p>
  </div>
</body>
</html>
  `.trim();

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [borrowerEmail],
      subject: `💌 Friendly nudge from ${ownerName}: "${itemTitle}" misses home!`,
      html,
    });

    if (error) {
      console.warn("[Resend Error] Failed to send return nudge email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown Resend error";
    console.warn("[Resend Exception] Error sending return nudge email:", message);
    return { success: false, error: message };
  }
}

export interface SendBorrowRequestEmailParams {
  ownerEmail: string;
  ownerName: string;
  requesterName: string;
  itemTitle: string;
  circleName: string;
  durationIntent: string;
  appUrl?: string;
}

/**
 * Sends a playful transactional email notifying an item owner that a circle friend wants to borrow their piece.
 */
export async function sendBorrowRequestEmail(
  params: SendBorrowRequestEmailParams
): Promise<EmailSendResult> {
  const client = getResendClient();
  if (!client) {
    console.warn(
      "[Resend] RESEND_API_KEY is not configured. Borrow request email skipped."
    );
    return { success: false, skipped: true, error: "RESEND_API_KEY not configured" };
  }

  const {
    ownerEmail,
    ownerName,
    requesterName,
    itemTitle,
    circleName,
    durationIntent,
    appUrl = "https://sharedrobe.app",
  } = params;
  const targetUrl = `${appUrl.replace(/\/$/, "")}/sharedrobe`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>New Borrow Request: ${escapeHtml(itemTitle)}</title>
</head>
<body style="margin: 0; padding: 24px 16px; background-color: #FCFBF7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #121926;">
  <div style="max-width: 460px; margin: 0 auto; background-color: #FFFFFF; border: 1px solid #E5E2D6; border-radius: 24px; padding: 32px 24px; box-shadow: 0 4px 16px rgba(29, 42, 68, 0.04);">
    <div style="display: inline-block; background-color: #1D2A44; color: #FFFFFF; font-size: 10px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; padding: 4px 10px; border-radius: 6px; margin-bottom: 16px;">
      CIRCLE DIBS // BORROW REQUEST ✨
    </div>
    <h1 style="color: #121926; font-size: 20px; font-weight: 700; margin: 0 0 12px; line-height: 1.3;">
      ${escapeHtml(requesterName)} called dibs on "${escapeHtml(itemTitle)}"!
    </h1>
    <p style="color: #475467; font-size: 14px; line-height: 1.6; margin: 0 0 16px;">
      Hi ${escapeHtml(ownerName)}, your friend <strong>${escapeHtml(requesterName)}</strong> in <strong>${escapeHtml(circleName)}</strong> wants to borrow <strong>"${escapeHtml(itemTitle)}"</strong>.
    </p>
    <div style="background-color: #F0EFE9; border-radius: 12px; padding: 12px 16px; margin-bottom: 20px; font-size: 13px; color: #121926;">
      <strong>How long?</strong> "${escapeHtml(durationIntent)}"
    </div>
    <div style="margin: 24px 0 16px;">
      <a href="${escapeHtml(targetUrl)}" style="display: inline-block; background-color: #1D2A44; color: #FFFFFF; font-size: 13px; font-weight: 600; text-decoration: none; padding: 12px 24px; border-radius: 12px;">
        Approve or Decline in Share Drobe →
      </a>
    </div>
  </div>
</body>
</html>
  `.trim();

  try {
    const { data, error } = await client.emails.send({
      from: DEFAULT_FROM,
      to: [ownerEmail],
      subject: `✨ ${requesterName} wants to borrow "${itemTitle}" (${durationIntent})`,
      html,
    });

    if (error) {
      console.warn("[Resend Error] Failed to send borrow request email:", error);
      return { success: false, error: error.message };
    }

    return { success: true, id: data?.id };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown Resend error";
    console.warn("[Resend Exception] Error sending borrow request email:", message);
    return { success: false, error: message };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
