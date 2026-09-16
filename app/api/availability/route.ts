import { NextResponse } from "next/server";
import { serviceSupabase } from "@/lib/supabase";
import { TOTAL_SEATS } from "@/lib/seats";

// Public, PII-free seat availability. No customer data leaves the server.
export async function GET(req: Request) {
  try {
    const u = new URL(req.url);
    const date = u.searchParams.get("date") || "";
    const movieId = u.searchParams.get("movieId") || "";
    const showTime = u.searchParams.get("showTime") || "";
    if (!date) return NextResponse.json({ success: false, message: "Missing date." }, { status: 400 });
    const sb = serviceSupabase();
    let q = sb.from("bookings").select("movie_id,show_time,seats").eq("show_date", date).eq("status", "Confirmed");
    if (movieId) q = q.eq("movie_id", movieId);
    if (showTime) q = q.eq("show_time", showTime);
    const { data, error } = await q;
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });
    // Per-show sales modes set by admin (online | counter | noshow). Defaults to online.
    let modes: Record<string, string> = {};
    try {
      let oq = sb.from("show_overrides").select("movie_id,show_time,mode").eq("show_date", date);
      if (movieId) oq = oq.eq("movie_id", movieId);
      if (showTime) oq = oq.eq("show_time", showTime);
      const { data: ov } = await oq;
      (ov || []).forEach((o: any) => { modes[o.movie_id + "::" + o.show_time] = o.mode || "online"; });
    } catch {}
    const counts: Record<string, number> = {};
    const booked: string[] = [];
    (data || []).forEach((b: any) => {
      const seats: string[] = (b.seats || []).map((s: string) => String(s).toUpperCase());
      const k = b.movie_id + "::" + b.show_time;
      counts[k] = (counts[k] || 0) + seats.length;
      if (movieId && showTime) seats.forEach((s) => { if (!booked.includes(s)) booked.push(s); });
    });
    return NextResponse.json({ success: true, counts, booked, modes, total: TOTAL_SEATS });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
