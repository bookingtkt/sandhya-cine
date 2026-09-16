"use client";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@supabase/supabase-js";
import { SEAT_LAYOUT, calcPricing, inr, toISODate, displayDate, TOTAL_SEATS, isShowStarted } from "@/lib/seats";

const supabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

type Movie = {
  id: string; title: string; poster_url: string; description: string;
  start_date: string; end_date: string; timings: string[];
  status: string; quality: string;
};
type Settings = { theatre_name: string; ticket_price: number; gst_percent: number; convenience_fee: number };

export default function BookingPage() {
  const [dates, setDates] = useState<string[]>([]);
  const [date, setDate] = useState("");
  const [movies, setMovies] = useState<Movie[]>([]);
  const [settings, setSettings] = useState<Settings>({ theatre_name: "Sandhya Cine House", ticket_price: 85, gst_percent: 0, convenience_fee: 0 });
  const [movieId, setMovieId] = useState("");
  const [showTime, setShowTime] = useState("");
  const [search, setSearch] = useState("");
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false); const [msg, setMsg] = useState("");
  const [ticket, setTicket] = useState<any>(null);
  const [avail, setAvail] = useState<Record<string, number>>({});// seats left per "movieId::time"

  useEffect(() => {
    const d: string[] = []; const t = new Date();
    for (let i = 0; i < 30; i++) { const x = new Date(t); x.setDate(t.getDate() + i); d.push(toISODate(x)); }
    setDates(d); setDate(toISODate(t));
  }, []);

  useEffect(() => {
    (async () => {
      const sb = supabase();
      const s = await sb.from("settings").select("*").eq("id", 1).single();
      if (s.data) setSettings({ theatre_name: s.data.theatre_name, ticket_price: Number(s.data.ticket_price), gst_percent: Number(s.data.gst_percent), convenience_fee: Number(s.data.convenience_fee) });
      if (!date) return;
      const m = await sb.from("movies").select("*").eq("status", "Active").lte("start_date", date).gte("end_date", date).order("title");
      setMovies(((m.data as any[]) || []).map((r) => ({ ...r, title: r.title })));
    })();
  }, [date]);

  // seats-left per show for the chosen date (for the timing buttons)
  useEffect(() => {
    (async () => {
      setAvail({});
      if (!date) return;
      try {
        const sb = supabase();
        const { data } = await sb.from("bookings").select("movie_id,show_time,seats").eq("show_date", date).eq("status", "Confirmed");
        const counts: Record<string, number> = {};
        (data || []).forEach((b: any) => {
          const k = b.movie_id + "::" + b.show_time;
          counts[k] = (counts[k] || 0) + ((b.seats || []).length);
        });
        const left: Record<string, number> = {};
        Object.keys(counts).forEach((k) => { left[k] = TOTAL_SEATS - counts[k]; });
        setAvail(left);
      } catch {}
    })();
  }, [date]);

  // load booked seats for chosen show
  useEffect(() => {
    (async () => {
      setBooked(new Set()); setSelected([]);
      if (!date || !movieId || !showTime) return;
      const sb = supabase();
      const { data } = await sb.from("bookings").select("seats").eq("show_date", date).eq("movie_id", movieId).eq("show_time", showTime).eq("status", "Confirmed");
      const set = new Set<string>();
      (data || []).forEach((b: any) => (b.seats || []).forEach((s: string) => set.add(String(s).toUpperCase())));
      setBooked(set);
    })();
  }, [date, movieId, showTime]);

  const filtered = useMemo(() => movies.filter((m) => m.title.toLowerCase().includes(search.toLowerCase())), [movies, search]);
  const pricing = calcPricing(selected.length, settings.ticket_price, settings.gst_percent, settings.convenience_fee);
  const movie = movies.find((m) => m.id === movieId);

  const toggle = (s: string) => {
    if (booked.has(s)) return;
    setSelected((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  };

  const book = async () => {
    setMsg("");
    if (!movieId || !showTime) return setMsg("Please select a movie and showtime.");
    if (isShowStarted(date, showTime)) return setMsg("This show has already started and can't be booked.");
    if (!selected.length) return setMsg("Please select at least one seat.");
    if (!name.trim() || !phone.trim() || !email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg("Enter valid name, phone and email.");
    setLoading(true);
    try {
      const res = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, movieId, showTime, name, phone, email, seats: selected }) });
      const j = await res.json();
      if (!j.success) { setMsg(j.message || "Booking failed."); if (j.conflicts) { /* refresh booked */ } return; }
      setTicket(j); setSelected([]);
      // refresh booked seats
      const sb = supabase();
      const { data } = await sb.from("bookings").select("seats").eq("show_date", date).eq("movie_id", movieId).eq("show_time", showTime).eq("status", "Confirmed");
      const set = new Set<string>(); (data || []).forEach((b: any) => (b.seats || []).forEach((s: string) => set.add(String(s).toUpperCase()))); setBooked(set);
    } catch (e: any) { setMsg(e.message); } finally { setLoading(false); }
  };

  if (ticket) {
    return (
      <div className="mt-4 rounded-2xl bg-white p-5 text-black">
        <h1 className="text-center text-xl font-extrabold">{settings.theatre_name.toUpperCase()}</h1>
        <p className="text-center text-xs text-gray-500">ADMISSION TICKET</p>
        <div className="mt-3 text-sm">
          <div className="font-bold">{movie?.title}</div>
          <div>Date: {displayDate(date)} • Show: {showTime}</div>
          <div>Customer: {name} • {phone}</div>
          <div>Seats: {(ticket.seats || []).join(", ")}</div>
          <div className="mt-2">Ticket ₹{inr(ticket.ticketAmount)} • GST ₹{inr(ticket.gst)} • Fee ₹{inr(ticket.convenience)}</div>
          <div className="text-lg font-extrabold">Total ₹{inr(ticket.total)}</div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <QRCodeSVG value={ticket.bookingCode} size={120} />
          <div className="text-right text-xs">Booking ID<br /><b>{ticket.bookingCode}</b></div>
        </div>
        <div className="no-print mt-4 flex gap-2">
          <button onClick={() => window.print()} className="flex-1 rounded-lg bg-green-700 p-3 font-bold text-white">🖨️ Print / PDF</button>
          <button onClick={() => setTicket(null)} className="flex-1 rounded-lg bg-slate-700 p-3 font-bold text-white">🎟️ New Booking</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mt-3 flex items-center justify-between"><h2 className="text-xl font-extrabold">Book Your Tickets</h2><span className="text-xs text-slate-400">{displayDate(date)}</span></div>
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Search movies…" className="mt-2 w-full rounded-xl border border-white/15 bg-card p-3 text-sm outline-none" />
      <div className="seat-scroll mt-3 flex gap-2 overflow-x-auto pb-1">
        {dates.map((d) => (
          <button key={d} onClick={() => { setDate(d); setMovieId(""); setShowTime(""); }} className={`min-w-[64px] rounded-xl border p-2 text-center ${d === date ? "bg-brand text-black" : "bg-card text-white"}`}>
            <div className="text-lg font-extrabold">{d.slice(8)}</div>
            <div className="text-[11px]">{new Date(d + "T00:00").toLocaleDateString("en-IN", { weekday: "short" })}</div>
            <div className="text-[10px] opacity-70">{new Date(d + "T00:00").toLocaleDateString("en-IN", { month: "short" })}</div>
          </button>
        ))}
      </div>

      <h3 className="mb-2 mt-4 text-lg font-extrabold">▍Now Showing</h3>
      <div className="grid gap-3">
        {filtered.map((m) => (
          <div key={m.id} className="rounded-2xl border border-white/10 bg-card p-3">
            <div className="flex gap-3">
              {m.poster_url ? <img src={m.poster_url} alt="" className="h-36 w-24 rounded-lg object-cover" /> : <div className="grid h-36 w-24 place-items-center rounded-lg bg-white/10 text-xs">No Poster</div>}
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2"><div className="flex-1 font-extrabold">{m.title}</div><span className="rounded bg-green-500 px-1.5 py-0.5 text-[10px] font-bold text-black">{m.quality}</span></div>
                <div className="mt-1 line-clamp-2 text-xs text-slate-400">{m.description}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(m.timings || []).map((t) => {
                    const left = avail[m.id + "::" + t] ?? TOTAL_SEATS;
                    const started = isShowStarted(date, t);
                    const full = left <= 0;
                    const dis = started || full;
                    const active = movieId === m.id && showTime === t;
                    return (
                      <button key={t} disabled={dis} onClick={() => { setMovieId(m.id); setShowTime(t); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${active ? "bg-brand text-black" : dis ? "border-white/10 text-slate-500" : "border-white/20"}`}>
                        <span className="block">{t}</span>
                        <span className={`mt-0.5 block text-[10px] font-normal ${active ? "text-black" : started || full ? "text-red-400" : "text-green-400"}`}>{started ? "Started" : full ? "Full" : left + " left"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        ))}
        {!filtered.length && <div className="p-6 text-center text-sm text-slate-400">No movies for this date.</div>}
      </div>

      {movieId && showTime && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-card p-3">
          <div className="text-center text-sm font-bold">{movie?.title} • {displayDate(date)} • {showTime}</div>
          <div className="mx-auto mt-3 max-w-sm"><div className="h-1.5 rounded-full bg-white shadow-[0_0_12px_#fff9]" /><div className="mt-1 text-center text-[10px] tracking-[4px] text-slate-400">SCREEN</div></div>
          <div className="mt-1 text-center text-[10px] text-slate-500">← swipe to see all seats →</div>
          <div className="seat-scroll mt-2 max-h-[320px] overflow-auto">
            <div className="min-w-[800px] px-1">
            {SEAT_LAYOUT.map((count, r) => {
              const row = String.fromCharCode(65 + r);
              return (
                <div key={row} className="mb-1.5 flex items-center justify-center gap-1">
                  <span className="w-5 text-xs text-slate-400">{row}</span>
                  {Array.from({ length: count }, (_, i) => {
                    const id = `${row}${i + 1}`;
                    const isB = booked.has(id); const isS = selected.includes(id);
                    return <button key={id} disabled={isB} onClick={() => toggle(id)} title={id} className={`h-7 w-7 rounded text-[9px] font-bold ${isB ? "bg-red-600 text-white" : isS ? "bg-blue-600 text-white" : "bg-white text-black"}`}>{i + 1}</button>;
                  })}
                </div>
              );
            })}
            </div>
          </div>
          <div className="mt-2 text-xs text-slate-300">Selected: <b>{selected.join(", ") || "—"}</b></div>
          <div className="mt-2 rounded-xl bg-black/30 p-3 text-sm">
            <div className="flex justify-between"><span>Ticket</span><b>₹{inr(pricing.ticketAmount)}</b></div>
            <div className="flex justify-between"><span>GST {pricing.gstPercent ? `(${pricing.gstPercent}%)` : ""}</span><b>₹{inr(pricing.gst)}</b></div>
            <div className="flex justify-between"><span>Fee</span><b>₹{inr(pricing.convenienceFee)}</b></div>
            <div className="mt-1 flex justify-between border-t border-white/10 pt-2 text-base font-extrabold"><span>Total</span><span className="text-brand">₹{inr(pricing.total)}</span></div>
          </div>
          <div className="mt-3 grid gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" className="rounded-xl border border-white/15 bg-black/40 p-3 text-sm" />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" className="rounded-xl border border-white/15 bg-black/40 p-3 text-sm" />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (ticket will be sent)" className="rounded-xl border border-white/15 bg-black/40 p-3 text-sm" />
            <button disabled={loading || !selected.length} onClick={book} className="rounded-xl bg-brand p-3.5 font-extrabold text-black disabled:opacity-40">{loading ? "Booking…" : "Confirm Booking & Email Ticket"}</button>
            {msg && <div className="text-center text-xs text-yellow-300">{msg}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
