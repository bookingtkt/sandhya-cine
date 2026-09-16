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
  // Per-movie / per-show revenue (all confirmed bookings, not just latest 500)
  let sales: any[] = [];
  let movieTotals: any[] = [];
  try {
    const { data: all } = await sb.from("bookings").select("movie_id,show_date,show_time,seats,total_amount").eq("status", "Confirmed").limit(5000);
    const { data: movs } = await sb.from("movies").select("id,title");
    const titleOf: Record<string, string> = {};
    (movs || []).forEach((m: any) => { titleOf[m.id] = m.title; });
    const byShow: Record<string, any> = {};
    (all || []).forEach((b: any) => {
      const k = `${b.movie_id}||${b.show_date}||${b.show_time}`;
      if (!byShow[k]) byShow[k] = { movie_id: b.movie_id, title: titleOf[b.movie_id] || "Deleted movie", show_date: b.show_date, show_time: b.show_time, tickets: 0, bookings: 0, revenue: 0 };
      byShow[k].tickets += (b.seats || []).length;
      byShow[k].bookings += 1;
      byShow[k].revenue += Number(b.total_amount || 0);
    });
    sales = Object.values(byShow).sort((a: any, b: any) => String(b.show_date).localeCompare(String(a.show_date)) || String(b.show_time).localeCompare(String(a.show_time)));
    const byMovie: Record<string, any> = {};
    sales.forEach((r: any) => {
      if (!byMovie[r.movie_id]) byMovie[r.movie_id] = { movie_id: r.movie_id, title: r.title, tickets: 0, bookings: 0, revenue: 0 };
      byMovie[r.movie_id].tickets += r.tickets;
      byMovie[r.movie_id].bookings += r.bookings;
      byMovie[r.movie_id].revenue += r.revenue;
    });
    movieTotals = Object.values(byMovie).sort((a: any, b: any) => b.revenue - a.revenue);
  } catch {}
  // Admin per-show sales-mode overrides
  let overrides: any[] = [];
  try {
    const { data: ov } = await sb.from("show_overrides").select("*").order("show_date", { ascending: false }).limit(500);
    overrides = ov || [];
  } catch {}
  return NextResponse.json({ success: true, bookings: list, stats, sales, movieTotals, overrides });
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
  if (action === "set-show-mode") {
    const movieId = String(body.movieId || "").trim();
    const date = String(body.date || "").trim();
    const showTime = String(body.showTime || "").trim();
    const mode = String(body.mode || "online").trim();
    if (!movieId || !date || !showTime) return NextResponse.json({ success: false, message: "Pick movie, date and show." });
    if (!["online", "counter", "noshow"].includes(mode)) return NextResponse.json({ success: false, message: "Invalid mode." });
    if (mode === "online") {
      const { error } = await sb.from("show_overrides").delete().eq("movie_id", movieId).eq("show_date", date).eq("show_time", showTime);
      if (error) return NextResponse.json({ success: false, message: error.message + " (run supabase/migration_show_overrides.sql first)" });
      return NextResponse.json({ success: true, message: "Show set back to Online." });
    }
    const { error } = await sb.from("show_overrides").upsert(
      { movie_id: movieId, show_date: date, show_time: showTime, mode, updated_at: new Date().toISOString() },
      { onConflict: "movie_id,show_date,show_time" }
    );
    if (error) return NextResponse.json({ success: false, message: error.message + " (run supabase/migration_show_overrides.sql first)" });
    return NextResponse.json({ success: true, message: mode === "counter" ? "Show set to Counter sales only." : "Show marked as No show." });
  }
  if (action === "clear-show-mode") {
    const movieId = String(body.movieId || "").trim();
    const date = String(body.date || "").trim();
    const showTime = String(body.showTime || "").trim();
    const { error } = await sb.from("show_overrides").delete().eq("movie_id", movieId).eq("show_date", date).eq("show_time", showTime);
    if (error) return NextResponse.json({ success: false, message: error.message });
    return NextResponse.json({ success: true, message: "Override cleared (back to Online)." });
  }
  return NextResponse.json({ success: false, message: "Unknown action." });
}
