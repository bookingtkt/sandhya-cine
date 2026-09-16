import { NextResponse } from "next/server";
import { sendTicketEmail } from "@/lib/ticket-email";

// Sends ticket email via Resend. Skips gracefully if RESEND_API_KEY missing.
export async function POST(req: Request) {
  const { code } = await req.json().catch(() => ({ code: "" }));
  const r = await sendTicketEmail(String(code || ""));
  return NextResponse.json(r);
}
