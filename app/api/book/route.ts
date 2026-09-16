import { NextResponse } from "next/server";
import { serviceSupabase } from "@/lib/supabase";
import { validSeatSet, isBookingClosed, kolkataToday } from "@/lib/seats";

export async function POST(req: Request) {
  try {
    const { date, movieId, showTime, name, phone, email, seats } = await req.json();
    const clean: string[] = [...new Set(((seats as any[]) || []).map((s: any) => String(s).trim().toUpperCase()).filter(Boolean))];
    if (!date || !movieId || !showTime) return NextResponse.json({ success: false, message: "Select date/movie/show." }, { status: 400 });
    if (!name?.trim() || !phone?.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email || "")) return NextResponse.json({ success: false, message: "Enter valid name, phone, email." }, { status: 400 });
    if (!clean.length) return NextResponse.json({ success: false, message: "Select seats." }, { status: 400 });
    if (date < kolkataToday()) return NextResponse.json({ success: false, message: "Past dates cannot be booked." }, { status: 400 });
    if (isBookingClosed(date, showTime)) return NextResponse.json({ success: false, message: "Online booking closed for this show (cutoff 15 minutes before start). Tickets are available at the counter." }, { status: 400 });
    const valid = validSeatSet();
    const bad = clean.find((s) => !valid.has(s));
    if (bad) return NextResponse.json({ success: false, message: "Invalid seat: " + bad }, { status: 400 });

    const sb = serviceSupabase();
    // settings for pricing
    const { data: st } = await sb.from("settings").select("*").eq("id", 1).single();
    const price = Number(st?.ticket_price ?? 85), gstP = Number(st?.gst_percent ?? 0), fee = Number(st?.convenience_fee ?? 0);
    const ticketAmount = clean.length * price;
    const gst = (ticketAmount * gstP) / 100;
    const conv = clean.length * fee;
    const total = ticketAmount + gst + conv;

    // conflict check (confirmed bookings same show)
    const { data: ex } = await sb.from("bookings").select("seats").eq("show_date", date).eq("movie_id", movieId).eq("show_time", showTime).eq("status", "Confirmed");
    const taken = new Set<string>();
    (ex || []).forEach((b: any) => (b.seats || []).forEach((s: string) => taken.add(String(s).toUpperCase())));
    const conflicts = clean.filter((s) => taken.has(s));
    if (conflicts.length) return NextResponse.json({ success: false, message: "Already booked: " + conflicts.join(", "), conflicts }, { status: 409 });

    const code = "BK" + Date.now().toString().slice(-10) + Math.floor(100 + Math.random() * 900);
    const { error } = await sb.from("bookings").insert({
      booking_code: code, show_date: date, movie_id: movieId, show_time: showTime,
      customer_name: name.trim(), phone: phone.trim(), email: email.trim(), seats: clean,
      ticket_amount: ticketAmount, gst_amount: gst, convenience_amount: conv, total_amount: total,
      status: "Confirmed", ticket_status: "Unused"
    });
    if (error) return NextResponse.json({ success: false, message: error.message }, { status: 500 });

    // Email the ticket directly (no self-fetch). Booking succeeds even if email fails.
    const { sendTicketEmail } = await import("@/lib/ticket-email");
    const mail = await sendTicketEmail(code);
    return NextResponse.json({ success: true, bookingCode: code, seats: clean, ticketAmount, gst, convenience: conv, total, gstPercent: gstP, emailSent: mail.success, emailMessage: mail.message });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message }, { status: 500 });
  }
}
