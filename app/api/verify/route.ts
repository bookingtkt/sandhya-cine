import { NextResponse } from "next/server";
import { serviceSupabase, isAdminEmail } from "@/lib/supabase";

async function requireAdmin(req: Request) {
  const token = req.headers.get("x-admin-token") || "";
  if (!token) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await sb.auth.getUser(token);
  const email = data.user?.email || "";
  return isAdminEmail(email) ? email : null;
}

export async function POST(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin) return NextResponse.json({ success: false, message: "Not authorized. Login as admin." }, { status: 401 });
  const { code } = await req.json();
  const clean = String(code || "").trim();
  if (!clean) return NextResponse.json({ success: false, message: "Enter booking code." });
  const sb = serviceSupabase();
  const { data: b } = await sb.from("bookings").select("*").eq("booking_code", clean).single();
  if (!b) return NextResponse.json({ success: false, message: "❌ BOOKING NOT FOUND" }, { status: 404 });
  if (b.status !== "Confirmed") return NextResponse.json({ success: false, message: "❌ TICKET CANCELLED" }, { status: 400 });
  if (b.ticket_status === "Used") return NextResponse.json({ success: false, message: "⚠️ ALREADY USED", booking: b }, { status: 400 });
  await sb.from("bookings").update({ ticket_status: "Used", verified_at: new Date().toISOString() }).eq("id", b.id);
  return NextResponse.json({ success: true, message: "✅ VALID TICKET", booking: b });
}
