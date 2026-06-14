import { Resend } from "resend";

/**
 * Centralized transactional email sending via Resend.
 *
 * This is the app-side send path (invites, notifications). Auth emails
 * (verification, password reset, 2FA/OTP) are sent by Neon Auth through its
 * own Custom SMTP config — they do NOT go through this module.
 *
 * Emails send from the verified `send.stackedbench.com` subdomain so the
 * root domain stays free for a future mailbox host (MS365/Google/Zoho).
 */

const apiKey = process.env.RESEND_API_KEY;

// Default sender — overridable per-call. Display name + the verified subdomain.
const DEFAULT_FROM = process.env.EMAIL_FROM ?? "Stacked Bench <noreply@send.stackedbench.com>";

let resend: Resend | null = null;
function getResend(): Resend {
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set");
  }
  if (!resend) {
    resend = new Resend(apiKey);
  }
  return resend;
}

export type SendEmailParams = {
  to: string | string[];
  subject: string;
  html: string;
  /** Plain-text fallback. Strongly recommended for deliverability. */
  text?: string;
  /** Override the default sender. Must be on a verified domain. */
  from?: string;
  replyTo?: string | string[];
};

export type SendEmailResult = { id: string };

/**
 * Send a transactional email. Throws on failure so callers can decide whether
 * to surface or swallow the error (e.g. don't break a signup if a notification
 * fails). Returns the Resend message id on success.
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, subject, html, text, from, replyTo } = params;

  const { data, error } = await getResend().emails.send({
    from: from ?? DEFAULT_FROM,
    to,
    subject,
    html,
    ...(text ? { text } : {}),
    ...(replyTo ? { replyTo } : {}),
  });

  if (error) {
    console.error("[email] send failed", { to, subject, error });
    throw new Error(`Failed to send email: ${error.message}`);
  }
  if (!data?.id) {
    throw new Error("Failed to send email: no message id returned");
  }
  return { id: data.id };
}
