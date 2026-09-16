import { NextResponse } from "next/server";
import { serviceSupabase, isAdminEmail } from "@/lib/supabase";

async function requireAdmin(req: Request) {
  const token = req.headers.get("x-admin-token") || "";
  if (!token) return null;
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await sb.auth.getUser(token);
  return isAdminEmail(data.user?.email) ? data.user?.email : null;
}

export async function GET(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ success: false, message: "Not authorized." }, { status: 401 });
  const sb = serviceSupabase();
  const { data: bookings } = await sb.from("bookings").select("*").order("created_at", { ascending: false }).limit(500);
  const list = bookings || [];
  const conf = list.filter((b: any) => b.status === "Confirmed");
  const stats = { n: conf.length, seats: conf.reduce((a: number, b: any) => a + (b.seats || []).length, 0), rev: conf.reduce((a: number, b: any) => a + Number(b.total_amount || 0), 0) };
  return NextResponse.json({ success: true, bookings: list, stats });
}

export async function POST(req: Request) {
  if (!(await requireAdmin(req))) return NextResponse.json({ success: false, message: "Not authorized." }, { status: 401 });
  const sb = serviceSupabase();
  const body = await req.json();
  const { action } = body;

  if (action === "save-settings") {
    const s = body.settings;
    const { error } = await sb.from("settings").update({
      theatre_name: s.theatre_name, address: s.address, phone: s.phone, email: s.email,
      ticket_price: Number(s.ticket_price) || 85, gst_percent: Number(s.gst_percent) || 0, convenience_fee: Number(s.convenience_fee) || 0
    }).eq("id", 1);
    return NextResponse.json(error ? { success: false, message: error.message } : { success: true, message: "Settings saved." });
  }
  if (action === "save-movie") {
    const m = body.movie;
    const timings = String(m.timings || "").split(/[,\n]+/).map((x: string) => x.trim()).filter(Boolean);
    if (!m.title?.trim() || !m.start_date || !m.end_date || !timings.length) return NextResponse.json({ success: false, message: "Fill title, dates and at least one timing." });
    if (m.id) {
      const { error } = await sb.from("movies").update({ title: m.title.trim(), timings, quality: m.quality || "4K", start_date: m.start_date, end_date: m.end_date, description: m.description || "", poster_url: m.poster_url || "" }).eq("id", m.id);
      return NextResponse.json(error ? { success: false, message: error.message } : { success: true, message: "Movie updated." });
    }
    const { error } = await sb.from("movies").insert({ title: m.title.trim(), timings, quality: m.quality || "4K", start_date: m.start_date, end_date: m.end_date, description: m.description || "", poster_url: m.poster_url || "", status: "Active" });
    return NextResponse.json(error ? { success: false, message: error.message } : { success: true, message: "Movie added." });
  }
  if (action === "movie-toggle") {
    const cur = body.status === "Active" ? "Inactive" : "Active";
    await sb.from("movies").update({ status: cur }).eq("id", body.id);
    return NextResponse.json({ success: true, message: "Movie is now " + cur });
  }
  if (action === "movie-delete") {
    await sb.from("movies").delete().eq("id", body.id);
    return NextResponse.json({ success: true, message: "Movie deleted. Bookings remain." });
  }
  if (action === "cancel-booking") {
    await sb.from("bookings").update({ status: "Cancelled" }).eq("booking_code", body.id);
    return NextResponse.json({ success: true, message: "Booking cancelled." });
  }
  return NextResponse.json({ success: false, message: "Unknown action." });
}
