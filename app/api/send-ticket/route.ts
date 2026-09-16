import { NextResponse } from "next/server";
import { serviceSupabase } from "@/lib/supabase";

// Sends ticket email via Resend. Skips gracefully if RESEND_API_KEY missing.
export async function POST(req: Request) {
  try {
    const { code } = await req.json();
    const sb = serviceSupabase();
    const { data: b } = await sb.from("bookings").select("*").eq("booking_code", String(code)).single();
    if (!b) return NextResponse.json({ success: false, message: "Booking not found." });
    if (!process.env.RESEND_API_KEY) return NextResponse.json({ success: false, message: "Email not configured (RESEND_API_KEY missing). Ticket is still confirmed." });
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data: st } = await sb.from("settings").select("*").eq("id", 1).single();
    const { data: mv } = await sb.from("movies").select("*").eq("id", b.movie_id).single();
    const qr = `https://quickchart.io/qr?size=300&text=${encodeURIComponent(b.booking_code)}`;
    await resend.emails.send({
      from: process.env.TICKET_FROM_EMAIL || "tickets@example.com",
      to: b.email,
      subject: `${st?.theatre_name || "Theatre"} — Booking ${b.booking_code}`,
      html: `<h2>${st?.theatre_name || ""} — ADMISSION TICKET</h2>
        <p><b>Movie:</b> ${mv?.title || ""}<br/><b>Date:</b> ${b.show_date} <b>Show:</b> ${b.show_time}<br/>
        <b>Customer:</b> ${b.customer_name} (${b.phone})<br/><b>Seats:</b> ${(b.seats || []).join(", ")}<br/>
        <b>Total:</b> ₹${b.total_amount}</p>
        <img src="${qr}" width="180" height="180"/><p>Show this QR at entrance. Code: <b>${b.booking_code}</b></p>`
    });
    return NextResponse.json({ success: true, message: "Ticket emailed." });
  } catch (e: any) {
    return NextResponse.json({ success: false, message: e.message });
  }
}
