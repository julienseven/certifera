const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

type MailInput = { to: string; subject: string; text: string };

export async function sendMail(input: MailInput) {
  const apiKey = process.env.CERTIFERA_RESEND_API_KEY;
  const from = process.env.CERTIFERA_MAIL_FROM;
  if (!apiKey || !from) {
    return { delivered: false, mode: "console" as const };
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to: [input.to], subject: input.subject, text: input.text }),
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(payload?.message || "Could not deliver transactional email.");
  }
  return { delivered: true, mode: "resend" as const };
}

export function certiferaUrl(path: string) {
  return `${siteUrl.replace(/\/$/, "")}${path}`;
}

export function mailDeliveryStatus() {
  return { configured: Boolean(process.env.CERTIFERA_RESEND_API_KEY && process.env.CERTIFERA_MAIL_FROM), provider: process.env.CERTIFERA_RESEND_API_KEY ? "resend" : "console" };
}
