"use client";
import { useEffect, useMemo, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { createClient } from "@supabase/supabase-js";
import { SEAT_LAYOUT, calcPricing, inr, toISODate, displayDate, TOTAL_SEATS, isShowStarted, isBookingClosed } from "@/lib/seats";

const supabase = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

const BOOKING_NOTES = [
  "Entry is allowed only for valid ticket holders.",
  "Children above the age of 3 years require tickets.",
  "Tickets once purchased cannot be cancelled, exchanged or refunded.",
  "Outside food and beverages are not allowed inside the cinema premises.",
  "Patrons under the influence of alcohol or drugs will not be allowed inside the Cinema Premises.",
  "3D movie ticket price includes charges for 3D glass usage, 3D glass need to be returned after the movie.",
  "Luggage bags or electronic recording devices are not allowed inside the cinema. Anyone found recording or taking photos will face legal action.",
];

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
  const [settings, setSettings] = useState<Settings>({ theatre_name: "Ambadi 2k Cinemas", ticket_price: 85, gst_percent: 0, convenience_fee: 0 });
  const [movieId, setMovieId] = useState("");
  const [showTime, setShowTime] = useState("");
  const [search, setSearch] = useState("");
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState(""); const [phone, setPhone] = useState(""); const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false); const [msg, setMsg] = useState("");
  const [ticket, setTicket] = useState<any>(null);
  const [step, setStep] = useState(1); // 1 = movie+time, 2 = seats+confirm
  const [showNotes, setShowNotes] = useState(false);// booking-notes popup after "Continue to Seats"
  const [avail, setAvail] = useState<Record<string, number>>({});// seats left per "movieId::time"
  const [modes, setModes] = useState<Record<string, string>>({});// admin sales mode per "movieId::time": online|counter|noshow
  const modeOf = (mid: string, t: string) => modes[mid + "::" + t] || "online";

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

  // seats-left per show for the chosen date (via PII-free API)
  useEffect(() => {
    (async () => {
      setAvail({}); setModes({});
      if (!date) return;
      try {
        const r = await fetch(`/api/availability?date=${date}`).then((x) => x.json());
        if (!r.success) return;
        const left: Record<string, number> = {};
        Object.keys(r.counts || {}).forEach((k) => { left[k] = TOTAL_SEATS - (r.counts[k] || 0); });
        setAvail(left);
        setModes(r.modes || {});
      } catch {}
    })();
  }, [date]);

  // load booked seats for chosen show (via PII-free API)
  useEffect(() => {
    (async () => {
      setBooked(new Set()); setSelected([]);
      if (!date || !movieId || !showTime) return;
      try {
        const r = await fetch(`/api/availability?date=${date}&movieId=${movieId}&showTime=${encodeURIComponent(showTime)}`).then((x) => x.json());
        if (r.success) setBooked(new Set((r.booked || []).map((s: string) => String(s).toUpperCase())));
      } catch {}
    })();
  }, [date, movieId, showTime]);

  const filtered = useMemo(() => movies.filter((m) => m.title.toLowerCase().includes(search.toLowerCase())), [movies, search]);
  const pricing = calcPricing(selected.length, settings.ticket_price, settings.gst_percent, settings.convenience_fee);
  const movie = movies.find((m) => m.id === movieId);

  const toggle = (s: string) => {
    if (booked.has(s)) return;
    setSelected((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));
  };

  const goSeats = () => {
    setMsg("");
    if (!movieId || !showTime) { setMsg("Please select a movie and showtime."); return; }
    const md = modeOf(movieId, showTime);
    if (md === "noshow") { setMsg("This show is not available for booking."); return; }
    if (md === "counter") { setMsg("Online booking closed for this show. Tickets are available at the counter."); return; }
    if (isBookingClosed(date, showTime)) { setMsg("Online booking closed for this show. Tickets are available at the counter."); return; }
    setShowNotes(true);
  };

  const acceptNotes = () => {
    setShowNotes(false);
    setStep(2);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelNotes = () => {
    setShowNotes(false);
  };

  const book = async () => {
    setMsg("");
    if (!movieId || !showTime) return setMsg("Please select a movie and showtime.");
    const md0 = modeOf(movieId, showTime);
    if (md0 === "noshow") return setMsg("This show is not available for booking.");
    if (md0 === "counter") return setMsg("Online booking closed for this show. Tickets are available at the counter.");
    if (isBookingClosed(date, showTime)) return setMsg("Online booking closed for this show. Tickets are available at the counter.");
    if (!selected.length) return setMsg("Please select at least one seat.");
    if (!name.trim() || !phone.trim() || !email.trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return setMsg("Enter valid name, phone and email.");
    setLoading(true);
    try {
      const res = await fetch("/api/book", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date, movieId, showTime, name, phone, email, seats: selected }) });
      const j = await res.json();
      if (!j.success) { setMsg(j.message || "Booking failed."); if (j.conflicts) { /* refresh booked */ } return; }
      setTicket(j); setSelected([]);
      // refresh booked seats + counts
      try {
        const r = await fetch(`/api/availability?date=${date}&movieId=${movieId}&showTime=${encodeURIComponent(showTime)}`).then((x) => x.json());
        if (r.success) {
          setBooked(new Set((r.booked || []).map((s: string) => String(s).toUpperCase())));
          const left: Record<string, number> = {};
          Object.keys(r.counts || {}).forEach((k) => { left[k] = TOTAL_SEATS - (r.counts[k] || 0); });
          setAvail(left);
        }
      } catch {}
    } catch (e: any) { setMsg(e.message); } finally { setLoading(false); }
  };

  if (ticket) {
    return (
      <div className="mt-4 overflow-hidden rounded-2xl bg-white text-black shadow-xl">
        <div className="bg-black p-4 text-center text-white">
          <h1 className="text-xl font-extrabold tracking-wide">{settings.theatre_name.toUpperCase()}</h1>
          <p className="mt-0.5 text-[10px] tracking-[3px] text-slate-400">ADMISSION TICKET</p>
        </div>
        <div className="p-4">
          <div className="flex items-center gap-3 border-b border-dashed border-slate-300 pb-3">
            {movie?.poster_url
              ? <img src={movie.poster_url} alt="" className="h-28 w-20 rounded-lg bg-slate-200 object-cover" />
              : <div className="grid h-28 w-20 place-items-center rounded-lg bg-slate-200 text-[10px] text-slate-500">No Poster</div>}
            <div className="min-w-0">
              <div className="text-lg font-extrabold leading-tight">{movie?.title}</div>
              <div className="mt-1 text-[11px] text-slate-500">{movie?.quality} • {displayDate(date)} • {showTime}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-x-3 gap-y-2 border-b border-dashed border-slate-300 py-3 text-xs">
            <div><div className="text-[9px] uppercase text-slate-400">Booking ID</div><b className="break-all">{ticket.bookingCode}</b></div>
            <div><div className="text-[9px] uppercase text-slate-400">Seats</div><b>{(ticket.seats || []).join(", ")}</b></div>
            <div><div className="text-[9px] uppercase text-slate-400">Customer</div><b>{name}</b></div>
            <div><div className="text-[9px] uppercase text-slate-400">Phone</div><b>{phone}</b></div>
          </div>
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs">
            <div className="mb-1 border-b border-slate-200 pb-1 text-[13px] font-extrabold">Fare Breakdown</div>
            <div className="flex justify-between py-0.5 text-slate-600"><span>Ticket Fare</span><b className="text-black">₹{inr(ticket.ticketAmount)}</b></div>
            <div className="flex justify-between py-0.5 text-slate-600"><span>GST</span><b className="text-black">₹{inr(ticket.gst)}</b></div>
            <div className="flex justify-between py-0.5 text-slate-600"><span>Convenience Fee</span><b className="text-black">₹{inr(ticket.convenience)}</b></div>
            <div className="mt-1 flex justify-between border-t border-slate-200 pt-1.5 text-sm font-extrabold"><span>Total</span><span>₹{inr(ticket.total)}</span></div>
          </div>
          <div className="flex items-center justify-between pt-3">
            <div className="text-center"><QRCodeSVG value={ticket.bookingCode} size={110} /><div className="mt-1 text-[9px] text-slate-500">Show at entrance</div></div>
            <div className="text-right"><div className="text-[9px] uppercase text-slate-400">Booking ID</div><div className="text-sm font-extrabold">{ticket.bookingCode}</div></div>
          </div>
          <p className="pt-2 text-center text-[10px] text-slate-500">Please show this ticket / QR code at the theatre entrance.</p>
        </div>
        <div className="no-print flex gap-2 bg-slate-100 p-3">
          <button onClick={() => window.print()} className="flex-1 rounded-lg bg-green-700 p-3 font-bold text-white">🖨️ Print / PDF</button>
          <button onClick={() => { setTicket(null); setStep(1); setMovieId(""); setShowTime(""); setSelected([]); setMsg(""); }} className="flex-1 rounded-lg bg-slate-700 p-3 font-bold text-white">🎟️ New Booking</button>
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
          <button key={d} onClick={() => { setDate(d); setMovieId(""); setShowTime(""); setStep(1); setMsg(""); }} className={`min-w-[64px] rounded-xl border p-2 text-center ${d === date ? "bg-brand text-black" : "bg-card text-white"}`}>
            <div className="text-lg font-extrabold">{d.slice(8)}</div>
            <div className="text-[11px]">{new Date(d + "T00:00").toLocaleDateString("en-IN", { weekday: "short" })}</div>
            <div className="text-[10px] opacity-70">{new Date(d + "T00:00").toLocaleDateString("en-IN", { month: "short" })}</div>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center text-[11px] font-bold">
        <div className={`flex items-center gap-1 ${step === 1 ? "text-white" : "text-green-400"}`}><span className={`grid h-6 w-6 place-items-center rounded-full ${step === 1 ? "bg-brand text-black" : "bg-green-500 text-black"}`}>{step > 1 ? "✓" : "1"}</span> Movie</div>
        <div className="mx-2 h-px flex-1 bg-white/15" />
        <div className={`flex items-center gap-1 ${step === 2 ? "text-white" : "text-slate-500"}`}><span className={`grid h-6 w-6 place-items-center rounded-full ${step === 2 ? "bg-brand text-black" : "bg-white/10 text-slate-400"}`}>2</span> Seats & Confirm</div>
      </div>

      {step === 1 && (
      <>
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
                    const md = modeOf(m.id, t);
                    const started = isShowStarted(date, t);
                    const closed = started || isBookingClosed(date, t) || md === "counter";
                    const noshow = md === "noshow";
                    const full = left <= 0;
                    const dis = closed || full || noshow;
                    const active = movieId === m.id && showTime === t;
                    return (
                      <button key={t} disabled={dis} onClick={() => { setMovieId(m.id); setShowTime(t); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${active ? "bg-brand text-black" : dis ? "border-white/10 text-slate-500" : "border-white/20"}`}>
                        <span className="block">{t}</span>
                        <span className={`mt-0.5 block text-[10px] font-normal ${active ? "text-black" : closed || full || noshow ? "text-red-400" : "text-green-400"}`}>{noshow ? "No show" : started ? "Started" : closed ? "Counter only" : full ? "Full" : left + " left"}</span>
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
        <button onClick={goSeats} className="mt-3 w-full rounded-xl bg-brand p-3.5 font-extrabold text-black">Continue to Seats →</button>
      )}
      {msg && <div className="mt-2 text-center text-xs text-yellow-300">{msg}</div>}
      </>
      )}

      {step === 2 && movieId && showTime && (
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
            <button onClick={() => { setStep(1); setMsg(""); }} className="rounded-xl border border-white/20 bg-white/5 p-3 text-sm font-bold">← Back to Movie</button>
            {msg && <div className="text-center text-xs text-yellow-300">{msg}</div>}
          </div>
        </div>
      )}
      {showNotes && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" onClick={cancelNotes}>
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-white text-black shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Booking notes"
          >
            <div className="bg-black p-4 text-center text-white">
              <h2 className="text-base font-extrabold tracking-wide">📋 Notes</h2>
              <p className="mt-0.5 text-[11px] text-slate-400">{movie?.title} • {displayDate(date)} • {showTime}</p>
            </div>
            <ol className="max-h-[50vh] list-decimal space-y-2 overflow-y-auto p-5 pl-9 text-[13px] leading-relaxed">
              {BOOKING_NOTES.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ol>
            <div className="flex gap-2 bg-slate-100 p-3">
              <button onClick={cancelNotes} className="flex-1 rounded-lg bg-slate-600 p-3 font-bold text-white">Cancel</button>
              <button onClick={acceptNotes} autoFocus className="flex-1 rounded-lg bg-green-700 p-3 font-bold text-white">Accept</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
