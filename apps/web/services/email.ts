import nodemailer from "nodemailer";
import { getEmailSettings } from "@/lib/env";

function transport() {
  const settings = getEmailSettings();
  return {
    settings,
    client: nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === 465,
      auth: { user: settings.user, pass: settings.password },
      requireTLS: settings.port !== 465,
    }),
  };
}

async function sendLink(email: string, subject: string, heading: string, body: string, href: string): Promise<void> {
  const { settings, client } = transport();
  const escapedHref = href.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
  await client.sendMail({
    from: settings.from,
    to: email,
    subject,
    text: `${heading}\n\n${body}\n\n${href}\n\nIf you did not request this, you can ignore this message.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a"><h1>${heading}</h1><p>${body}</p><p><a href="${escapedHref}" style="display:inline-block;padding:12px 18px;background:#155eef;color:white;text-decoration:none;border-radius:10px">Continue securely</a></p><p style="font-size:12px;color:#64748b">If you did not request this, you can ignore this message.</p></div>`,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function sendBillingNotificationEmail(email: string, title: string, message: string): Promise<void> {
  const { settings, client } = transport();
  const href = `${settings.appUrl}/dashboard/billing`;
  await client.sendMail({
    from: settings.from,
    to: email,
    subject: `${title} · Locate Now billing`,
    text: `${title}\n\n${message}\n\nOpen billing: ${href}`,
    html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;color:#0f172a"><p style="font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#64748b">Locate Now billing</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><p><a href="${href}" style="display:inline-block;padding:12px 18px;background:#0f172a;color:white;text-decoration:none;border-radius:10px">Open billing</a></p></div>`,
  });
}

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const settings = getEmailSettings();
  const href = `${settings.appUrl}/verify-email?token=${encodeURIComponent(token)}`;
  await sendLink(email, "Verify your B Socio AR email", "Verify your email", "Confirm your address to activate secure sign-in.", href);
}

export async function sendPasswordResetEmail(email: string, token: string, admin = false): Promise<void> {
  const settings = getEmailSettings();
  const href = `${settings.appUrl}/reset-password?token=${encodeURIComponent(token)}${admin ? "&portal=admin" : ""}`;
  await sendLink(email, "Reset your B Socio AR password", "Reset your password", "This time-limited link lets you choose a new password.", href);
}
