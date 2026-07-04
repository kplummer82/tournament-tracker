/**
 * Plain, dependency-free email templates. Each function returns the pieces
 * `sendEmail` needs: `subject`, `html`, and a `text` fallback.
 *
 * Kept deliberately simple (inline-styled HTML, no React Email) for now — the
 * brand primary is #ff4b00. Layer in a templating lib later if this grows.
 */

/** Escape user-supplied values before interpolating into HTML. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type EmailContent = { subject: string; html: string; text: string };

const BRAND = "#ff4b00";

function shell(bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
            <tr>
              <td style="background:${BRAND};padding:20px 28px;">
                <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.01em;">Stacked Bench</span>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;color:#18181b;font-size:15px;line-height:1.5;">
                ${bodyHtml}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

/**
 * Invite email — sent when an operator invites someone to a team/league/etc.
 * Built ahead of the invite system (gap X1); the send call site lands with X1.
 */
export function inviteEmail(params: {
  inviteUrl: string;
  invitedByName: string;
  /** Human label for what they're being invited to, e.g. "the Spring 2026 season". */
  scopeLabel: string;
}): EmailContent {
  const { inviteUrl, invitedByName, scopeLabel } = params;

  const subject = `${invitedByName} invited you to ${scopeLabel} on Stacked Bench`;

  const html = shell(`
    <p style="margin:0 0 16px;"><strong>${esc(invitedByName)}</strong> has invited you to join
    <strong>${esc(scopeLabel)}</strong> on Stacked Bench.</p>
    <p style="margin:0 0 24px;">Click below to accept the invitation and set up your account.</p>
    <p style="margin:0 0 24px;">
      <a href="${esc(inviteUrl)}" style="display:inline-block;background:${BRAND};color:#ffffff;text-decoration:none;font-weight:600;padding:12px 24px;border-radius:8px;">Accept invitation</a>
    </p>
    <p style="margin:0;color:#71717a;font-size:13px;">If the button doesn't work, paste this link into your browser:<br>
    <a href="${esc(inviteUrl)}" style="color:${BRAND};word-break:break-all;">${esc(inviteUrl)}</a></p>
  `);

  const text = `${invitedByName} has invited you to join ${scopeLabel} on Stacked Bench.

Accept the invitation and set up your account:
${inviteUrl}
`;

  return { subject, html, text };
}

/**
 * MFA one-time code email — sent when a user with two-step verification signs
 * in (or turns the feature on). App-layer send via Resend, not Neon Auth SMTP.
 */
export function mfaCodeEmail(params: {
  code: string;
  expiresMinutes: number;
}): EmailContent {
  const { code, expiresMinutes } = params;

  const subject = "Your Stacked Bench verification code";

  const html = shell(`
    <p style="margin:0 0 16px;">Use this code to finish signing in:</p>
    <p style="margin:0 0 24px;font-size:32px;font-weight:700;letter-spacing:0.35em;color:${BRAND};font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;">${esc(code)}</p>
    <p style="margin:0;color:#71717a;font-size:13px;">This code expires in ${expiresMinutes} minutes. If you didn't try to sign in, you can ignore this email — your password still protects your account.</p>
  `);

  const text = `Your Stacked Bench verification code is: ${code}

This code expires in ${expiresMinutes} minutes. If you didn't try to sign in, you can ignore this email.
`;

  return { subject, html, text };
}
