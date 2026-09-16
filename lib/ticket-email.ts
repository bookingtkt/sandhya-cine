import { serviceSupabase } from "@/lib/supabase";

// Shared ticket-email sender used by /api/book (direct call) and /api/send-ticket.
// Never throws — returns { success, message }.
export async function sendTicketEmail(bookingCode: string): Promise<{ success: boolean; message: string }> {
  try {
    const code = String(bookingCode || "").trim();
    if (!code) return { success: false, message: "Missing booking code." };
    if (!process.env.RESEND_API_KEY) {
      return { success: false, message: "Email not configured (RESEND_API_KEY missing). Ticket is still confirmed." };
    }
    const sb = serviceSupabase();
    const { data: b } = await sb.from("bookings").select("*").eq("booking_code", code).single();
    if (!b) return { success: false, message: "Booking not found." };
    const { Resend } = await import("resend");
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data: st } = await sb.from("settings").select("*").eq("id", 1).single();
    const { data: mv } = await sb.from("movies").select("*").eq("id", b.movie_id).single();
    const qr = `https://quickchart.io/qr?size=300&text=${encodeURIComponent(b.booking_code)}`;
    const { error } = await resend.emails.send({
      from: process.env.TICKET_FROM_EMAIL || "tickets@example.com",
      to: b.email,
      subject: `${st?.theatre_name || "Theatre"} — Booking ${b.booking_code}`,
      html: `<h2>${st?.theatre_name || ""} — ADMISSION TICKET</h2>
        <p><b>Movie:</b> ${mv?.title || ""}<br/><b>Date:</b> ${b.show_date} <b>Show:</b> ${b.show_time}<br/>
        <b>Customer:</b> ${b.customer_name} (${b.phone})<br/><b>Seats:</b> ${(b.seats || []).join(", ")}<br/>
        <b>Total:</b> ₹${b.total_amount}</p>
        <img src="${qr}" width="180" height="180"/><p>Show this QR at entrance. Code: <b>${b.booking_code}</b></p>`
    });
    if (error) return { success: false, message: "Email failed: " + error.message };
    return { success: true, message: "Ticket emailed." };
  } catch (e: any) {
    return { success: false, message: e?.message || "Email failed." };
  }
}
