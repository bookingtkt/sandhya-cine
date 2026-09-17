"use client";
import { useEffect, useRef, useState } from "react";
import { createClient } from "@supabase/supabase-js";

let _client: any = null;
const getClient = () => {
  if (_client) return _client;
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    if (!url || !key) return null;
    _client = createClient(url, key);
    return _client;
  } catch {
    return null;
  }
};
const sb = () => getClient();

export default function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [envOk, setEnvOk] = useState(true);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("bookings");
  const [bookings, setBookings] = useState<any[]>([]);
  const [movies, setMovies] = useState<any[]>([]);
  const [stats, setStats] = useState({ n: 0, seats: 0, rev: 0 });
  const [sales, setSales] = useState<any[]>([]);
  const [movieTotals, setMovieTotals] = useState<any[]>([]);
  const [overrides, setOverrides] = useState<any[]>([]);
  const [salesDate, setSalesDate] = useState("");
  const [showCtl, setShowCtl] = useState({ movieId: "", date: "", showTime: "", mode: "counter" });
  const [qr, setQr] = useState(""); const [qrRes, setQrRes] = useState("");
  const [scanning, setScanning] = useState(false);
  const scannerRef = useRef<any>(null);
  // movie form
  const [f, setF] = useState({ id: "", title: "", timings: "", quality: "4K", start_date: "", end_date: "", description: "", poster_url: "" });
  const [file, setFile] = useState<File | null>(null);
  // settings
  const [s, setS] = useState({ theatre_name: "", address: "", phone: "", email: "", ticket_price: 85, gst_percent: 0, convenience_fee: 0 });

  useEffect(() => {
    try {
      const c = sb();
      if (!c) { setEnvOk(false); return; }
      c.auth.getUser().then(({ data }: any) => setUser(data.user || null)).catch(() => {});
    } catch { setEnvOk(false); }
  }, []);

  const login = async () => {
    setMsg("");
    const c = sb();
    if (!c) { setMsg("App keys missing on server. Add env vars in Vercel and Redeploy."); setEnvOk(false); return; }
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);
    setUser(data.user);
  };
  const logout = async () => { try { await sb()?.auth.signOut(); } catch {} setUser(null); };

  const authHeaders = async () => {
    try {
      const c = sb();
      if (!c) return {};
      const { data } = await c.auth.getSession();
      return { "x-admin-token": data.session?.access_token || "" };
    } catch { return {}; }
  };

  const load = async () => {
    const c = sb();
    if (!c) { setEnvOk(false); return; }
    const h = await authHeaders();
    const b = await fetch("/api/admin-data", { headers: h as any }).then((r) => r.json());
    if (b.success) { setBookings(b.bookings); setStats(b.stats); setSales(b.sales || []); setMovieTotals(b.movieTotals || []); setOverrides(b.overrides || []); }
    const m = await c.from("movies").select("*").order("start_date", { ascending: false });
    setMovies(m.data || []);
    const st = await c.from("settings").select("*").eq("id", 1).single();
    if (st.data) setS({ theatre_name: st.data.theatre_name || "", address: st.data.address || "", phone: st.data.phone || "", email: st.data.email || "", ticket_price: Number(st.data.ticket_price), gst_percent: Number(st.data.gst_percent), convenience_fee: Number(st.data.convenience_fee) });
  };
  useEffect(() => { if (user) load(); }, [user]);

  const saveSettings = async () => {
    const h = await authHeaders();
    const r = await fetch("/api/admin-data", { method: "POST", headers: { "Content-Type": "application/json", ...(h as any) }, body: JSON.stringify({ action: "save-settings", settings: s }) }).then((r) => r.json());
    alert(r.message);
  };

  const saveMovie = async () => {
    let poster = f.poster_url;
    if (file) {
      const c = sb();
      if (!c) { alert("App keys missing on server. Add env vars in Vercel and Redeploy."); return; }
      const path = `${Date.now()}-${file.name}`.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const up = await c.storage.from("posters").upload(path, file, { upsert: true });
      if (up.error) return alert("Poster upload failed: " + up.error.message + " (create public bucket 'posters' first)");
      poster = c.storage.from("posters").getPublicUrl(path).data.publicUrl;
    }
    const h = await authHeaders();
    const r = await fetch("/api/admin-data", { method: "POST", headers: { "Content-Type": "application/json", ...(h as any) }, body: JSON.stringify({ action: "save-movie", movie: { ...f, poster_url: poster } }) }).then((r) => r.json());
    alert(r.message); if (r.success) { setF({ id: "", title: "", timings: "", quality: "4K", start_date: "", end_date: "", description: "", poster_url: "" }); setFile(null); load(); }
  };

  const movieAction = async (action: string, id?: string, status?: string) => {
    if (action === "delete" && !confirm("Delete movie? Bookings remain.")) return;
    const h = await authHeaders();
    const r = await fetch("/api/admin-data", { method: "POST", headers: { "Content-Type": "application/json", ...(h as any) }, body: JSON.stringify({ action: `movie-${action}`, id, status }) }).then((r) => r.json());
    alert(r.message); load();
  };

  const cancelBooking = async (code: string) => {
    if (!confirm("Cancel " + code + "?")) return;
    const h = await authHeaders();
    const r = await fetch("/api/admin-data", { method: "POST", headers: { "Content-Type": "application/json", ...(h as any) }, body: JSON.stringify({ action: "cancel-booking", id: code }) }).then((r) => r.json());
    alert(r.message); load();
  };

  const titleOf = (id: string) => movies.find((m: any) => m.id === id)?.title || "Deleted movie";

  const saveShowMode = async () => {
    if (!showCtl.movieId || !showCtl.date || !showCtl.showTime) { alert("Pick movie, date and show."); return; }
    const h = await authHeaders();
    const r = await fetch("/api/admin-data", { method: "POST", headers: { "Content-Type": "application/json", ...(h as any) }, body: JSON.stringify({ action: "set-show-mode", ...showCtl }) }).then((r) => r.json());
    alert(r.message); if (r.success) load();
  };

  const clearShowMode = async (movieId: string, date: string, showTime: string) => {
    if (!confirm(`Clear override for ${titleOf(movieId)} • ${date} • ${showTime}? (back to Online)`)) return;
    const h = await authHeaders();
    const r = await fetch("/api/admin-data", { method: "POST", headers: { "Content-Type": "application/json", ...(h as any) }, body: JSON.stringify({ action: "clear-show-mode", movieId, date, showTime }) }).then((r) => r.json());
    alert(r.message); load();
  };

  const verify = async (code?: string) => {
    const c = String(code ?? qr).trim();
    if (!c) { setQrRes("Enter or scan a code first."); return; }
    const h = await authHeaders();
    const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json", ...(h as any) }, body: JSON.stringify({ code: c }) }).then((r) => r.json());
    setQrRes(r.success ? `✅ VALID — ${r.booking.customer_name} • ${(r.booking.seats || []).join(", ")} • ${r.booking.show_date} ${r.booking.show_time}` : `❌ ${r.message}`);
    load();
  };

  const stopScan = async () => {
    try { await scannerRef.current?.clear(); } catch {}
    scannerRef.current = null;
    setScanning(false);
  };

  const startScan = async () => {
    setQrRes("");
    setScanning(true);
    try {
      const { Html5QrcodeScanner } = await import("html5-qrcode");
      const scanner = new Html5QrcodeScanner("qr-reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
      scannerRef.current = scanner;
      scanner.render(
        (text: string) => { stopScan(); setQr(text); verify(text); },
        () => {}
      );
    } catch (e: any) {
      setScanning(false);
      setQrRes("Camera failed: " + (e?.message || "permission denied. Use HTTPS and allow camera."));
    }
  };

  useEffect(() => () => { try { scannerRef.current?.clear(); } catch {} }, []);

  if (!user) return (
    <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-white/10 bg-card p-6">
      <h1 className="text-center text-xl font-extrabold">🔐 Admin Login</h1>
      {!envOk && <div className="mb-3 rounded-lg bg-red-900/50 p-3 text-center text-xs text-red-200">Server keys missing. Add env vars in Vercel Settings and Redeploy.</div>}
      <p className="mb-3 text-center text-xs text-slate-400">Use your Supabase Auth email (create user in Supabase → Authentication → Users)</p>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="mb-2 w-full rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="mb-2 w-full rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
      <button onClick={login} className="w-full rounded-lg bg-green-700 p-3 font-bold">Login</button>
      {msg && <div className="mt-2 text-center text-xs text-red-300">{msg}</div>}
    </div>
  );

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between"><h1 className="text-xl font-extrabold">🎬 Theatre Admin</h1><button onClick={logout} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold">Logout</button></div>
      <div className="mt-2 flex flex-wrap gap-2">
        {(["bookings", "sales", "shows", "movies", "settings", "verify"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === t ? "bg-brand text-black" : "bg-card"}`}>{t}</button>)}
        <button onClick={load} className="rounded-lg bg-green-700 px-3 py-2 text-sm font-bold">🔄</button>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-card p-3"><div className="text-xs text-slate-400">Bookings</div><div className="text-xl font-extrabold">{stats.n}</div></div>
        <div className="rounded-xl bg-card p-3"><div className="text-xs text-slate-400">Seats</div><div className="text-xl font-extrabold">{stats.seats}</div></div>
        <div className="rounded-xl bg-card p-3"><div className="text-xs text-slate-400">Revenue</div><div className="text-xl font-extrabold">₹{Number(stats.rev).toLocaleString("en-IN")}</div></div>
      </div>

      {tab === "verify" && (
        <div className="mt-3 rounded-xl bg-card p-4">
          <h2 className="font-bold">📱 Verify Ticket (QR = booking code)</h2>
          <a href="/verify" className="mt-2 block rounded-lg bg-green-700 p-3 text-center text-sm font-bold">⚡ Open Fast Scanner (auto-verify, rapid next) →</a>
          <p className="mt-2 text-xs text-slate-400">Scan with camera, use a USB barcode scanner (click the box first, then scan), or paste the code.</p>
          <div className="mt-2 flex gap-2">
            <input value={qr} onChange={(e) => setQr(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") verify(); }} placeholder="Scan / paste BK… code" className="flex-1 rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
            <button onClick={() => verify()} className="rounded-lg bg-blue-600 px-4 font-bold">Verify</button>
          </div>
          <div className="mt-2">
            {!scanning
              ? <button onClick={startScan} className="w-full rounded-lg bg-slate-700 p-3 text-sm font-bold">📷 Scan with Camera</button>
              : <button onClick={stopScan} className="w-full rounded-lg bg-red-700 p-3 text-sm font-bold">⏹ Stop Camera</button>}
          </div>
          {scanning && <div id="qr-reader" className="mt-2 overflow-hidden rounded-lg" />}
          {qrRes && <div className="mt-2 text-sm">{qrRes}</div>}
        </div>
      )}

      {tab === "settings" && (
        <div className="mt-3 rounded-xl bg-card p-4">
          <h2 className="font-bold">⚙️ Theatre & Pricing</h2>
          <div className="mt-2 grid gap-2">
            {(["theatre_name", "address", "phone", "email"] as const).map((k) => <input key={k} value={(s as any)[k]} onChange={(e) => setS({ ...s, [k]: e.target.value })} placeholder={k} className="rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />)}
            {(["ticket_price", "gst_percent", "convenience_fee"] as const).map((k) => <input key={k} type="number" value={(s as any)[k]} onChange={(e) => setS({ ...s, [k]: Number(e.target.value) })} placeholder={k} className="rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />)}
            <button onClick={saveSettings} className="rounded-lg bg-green-700 p-3 font-bold">💾 Save</button>
          </div>
        </div>
      )}

      {tab === "sales" && (
        <div className="mt-3 grid gap-3">
          <div className="rounded-xl bg-card p-4">
            <h2 className="font-bold">💰 Revenue per Movie</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[500px] text-left text-xs">
                <thead><tr className="text-slate-400"><th className="p-2">Movie</th><th>Bookings</th><th>Tickets</th><th>Revenue</th></tr></thead>
                <tbody>
                  {movieTotals.map((r: any) => (
                    <tr key={r.movie_id} className="border-t border-white/10">
                      <td className="p-2 font-bold">{r.title}</td><td>{r.bookings}</td><td>{r.tickets}</td><td>₹{Number(r.revenue).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!movieTotals.length && <div className="p-4 text-center text-sm text-slate-400">No confirmed bookings yet.</div>}
            </div>
          </div>
          <div className="rounded-xl bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="flex-1 font-bold">🎟️ Tickets & Revenue per Show</h2>
              <input value={salesDate} onChange={(e) => setSalesDate(e.target.value)} type="date" className="rounded-lg border border-white/15 bg-black/40 p-2 text-xs" />
              {salesDate && <button onClick={() => setSalesDate("")} className="rounded bg-slate-700 px-2 py-1 text-xs">Clear</button>}
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[600px] text-left text-xs">
                <thead><tr className="text-slate-400"><th className="p-2">Date</th><th>Movie</th><th>Show</th><th>Bookings</th><th>Tickets</th><th>Revenue</th></tr></thead>
                <tbody>
                  {sales.filter((r: any) => !salesDate || r.show_date === salesDate).map((r: any, i: number) => (
                    <tr key={i} className="border-t border-white/10">
                      <td className="p-2">{r.show_date}</td><td>{r.title}</td><td>{r.show_time}</td>
                      <td>{r.bookings}</td><td>{r.tickets}</td><td>₹{Number(r.revenue).toLocaleString("en-IN")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!sales.filter((r: any) => !salesDate || r.show_date === salesDate).length && <div className="p-4 text-center text-sm text-slate-400">No sales for this filter.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === "shows" && (
        <div className="mt-3 grid gap-3">
          <div className="rounded-xl bg-card p-4">
            <h2 className="font-bold">🎛️ Show Sales Control — Counter / No Show</h2>
            <p className="mt-1 text-xs text-slate-400">Switch a specific show to <b>Counter only</b> (online blocked, counter continues) or <b>No show</b> (fully hidden from booking). Default is <b>Online</b>.</p>
            <div className="mt-2 grid gap-2">
              <select value={showCtl.movieId} onChange={(e) => setShowCtl({ ...showCtl, movieId: e.target.value, showTime: "" })} className="rounded-lg border border-white/15 bg-black/40 p-3 text-sm">
                <option value="">Select movie…</option>
                {movies.map((m: any) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
              <div className="flex gap-2">
                <input value={showCtl.date} onChange={(e) => setShowCtl({ ...showCtl, date: e.target.value })} type="date" className="flex-1 rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
                <select value={showCtl.showTime} onChange={(e) => setShowCtl({ ...showCtl, showTime: e.target.value })} className="flex-1 rounded-lg border border-white/15 bg-black/40 p-3 text-sm">
                  <option value="">Show…</option>
                  {((movies.find((m: any) => m.id === showCtl.movieId)?.timings) || []).map((t: string) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                {(["online", "counter", "noshow"] as const).map((md) => (
                  <button key={md} onClick={() => setShowCtl({ ...showCtl, mode: md })} className={`flex-1 rounded-lg p-3 text-sm font-bold ${showCtl.mode === md ? "bg-brand text-black" : "bg-white/5"}`}>
                    {md === "online" ? "🌐 Online" : md === "counter" ? "🏪 Counter only" : "🚫 No show"}
                  </button>
                ))}
              </div>
              <button onClick={saveShowMode} className="rounded-lg bg-green-700 p-3 font-bold">💾 Apply to this show</button>
            </div>
          </div>
          <div className="rounded-xl bg-card p-4">
            <h2 className="font-bold">Active overrides</h2>
            <div className="mt-2 grid gap-2">
              {overrides.map((o: any) => (
                <div key={o.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 p-3 text-sm">
                  <div className="flex-1"><b>{titleOf(o.movie_id)}</b> <span className="text-slate-400">• {o.show_date} • {o.show_time}</span></div>
                  <span className={`rounded px-2 py-1 text-xs font-bold ${o.mode === "counter" ? "bg-yellow-600" : "bg-red-600"}`}>{o.mode === "counter" ? "Counter only" : "No show"}</span>
                  <button onClick={() => clearShowMode(o.movie_id, o.show_date, o.show_time)} className="rounded bg-slate-700 px-2 py-1 text-xs">Clear → Online</button>
                </div>
              ))}
              {!overrides.length && <div className="p-4 text-center text-sm text-slate-400">No overrides — all shows are Online.</div>}
            </div>
          </div>
        </div>
      )}

      {tab === "movies" && (
        <div className="mt-3 rounded-xl bg-card p-4">
          <h2 className="font-bold">🎬 Add / Edit Movie</h2>
          <input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] || null)} className="mt-2 text-sm" />
          <div className="mt-2 grid gap-2">
            <input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Movie name" className="rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
            <input value={f.timings} onChange={(e) => setF({ ...f, timings: e.target.value })} placeholder="Timings: 11 AM, 2:30 PM, 6 PM" className="rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
            <div className="flex gap-2">
              <input value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value })} type="date" className="flex-1 rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
              <input value={f.end_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} type="date" className="flex-1 rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
              <select value={f.quality} onChange={(e) => setF({ ...f, quality: e.target.value })} className="rounded-lg border border-white/15 bg-black/40 p-3 text-sm"><option>2K</option><option>4K</option></select>
            </div>
            <textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Description" className="rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
            <button onClick={saveMovie} className="rounded-lg bg-green-700 p-3 font-bold">{f.id ? "💾 Save Changes" : "➕ Add Movie"}</button>
            {f.id && <button onClick={() => setF({ id: "", title: "", timings: "", quality: "4K", start_date: "", end_date: "", description: "", poster_url: "" })} className="rounded-lg bg-slate-700 p-2 text-sm">Clear</button>}
          </div>
          <div className="mt-4 grid gap-2">
            {movies.map((m) => (
              <div key={m.id} className="rounded-lg border border-white/10 p-3 text-sm">
                <b>{m.title}</b> <span className="text-slate-400">({m.status} • {(m.timings || []).join(", ")})</span>
                <div className="mt-1 flex gap-2">
                  <button onClick={() => setF({ id: m.id, title: m.title, timings: (m.timings || []).join(", "), quality: m.quality, start_date: m.start_date, end_date: m.end_date, description: m.description, poster_url: m.poster_url })} className="rounded bg-blue-600 px-2 py-1">Edit</button>
                  <button onClick={() => movieAction("toggle", m.id, m.status)} className="rounded bg-yellow-700 px-2 py-1">{m.status === "Active" ? "Disable" : "Enable"}</button>
                  <button onClick={() => movieAction("delete", m.id)} className="rounded bg-red-600 px-2 py-1">Delete</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "bookings" && (
        <div className="mt-3 overflow-x-auto rounded-xl bg-card p-2">
          <table className="w-full min-w-[700px] text-left text-xs">
            <thead><tr className="text-slate-400"><th className="p-2">Code</th><th>Date</th><th>Show</th><th>Customer</th><th>Seats</th><th>Total</th><th>Status</th><th>Ticket</th><th></th></tr></thead>
            <tbody>
              {bookings.map((b) => (
                <tr key={b.id} className="border-t border-white/10">
                  <td className="p-2">{b.booking_code}</td><td>{b.show_date}</td><td>{b.show_time}</td>
                  <td>{b.customer_name}<br /><span className="text-slate-400">{b.phone}</span></td>
                  <td>{(b.seats || []).join(", ")}</td><td>₹{b.total_amount}</td>
                  <td>{b.status}</td><td>{b.ticket_status}</td>
                  <td>{b.status === "Confirmed" && <button onClick={() => cancelBooking(b.booking_code)} className="rounded bg-red-600 px-2 py-1">Cancel</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!bookings.length && <div className="p-6 text-center text-slate-400">No bookings.</div>}
        </div>
      )}
    </div>
  );
}
