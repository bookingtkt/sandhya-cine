"use client";
import { useEffect, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const sb = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

export default function AdminPage() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [msg, setMsg] = useState("");
  const [tab, setTab] = useState("bookings");
  const [bookings, setBookings] = useState<any[]>([]);
  const [movies, setMovies] = useState<any[]>([]);
  const [stats, setStats] = useState({ n: 0, seats: 0, rev: 0 });
  const [qr, setQr] = useState(""); const [qrRes, setQrRes] = useState("");
  // movie form
  const [f, setF] = useState({ id: "", title: "", timings: "", quality: "4K", start_date: "", end_date: "", description: "", poster_url: "" });
  const [file, setFile] = useState<File | null>(null);
  // settings
  const [s, setS] = useState({ theatre_name: "", address: "", phone: "", email: "", ticket_price: 85, gst_percent: 0, convenience_fee: 0 });

  useEffect(() => { sb().auth.getUser().then(({ data }) => setUser(data.user || null)); }, []);

  const login = async () => {
    setMsg("");
    const { data, error } = await sb().auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);
    setUser(data.user);
  };
  const logout = async () => { await sb().auth.signOut(); setUser(null); };

  const authHeaders = async () => {
    const { data } = await sb().auth.getSession();
    return { "x-admin-token": data.session?.access_token || "" };
  };

  const load = async () => {
    const h = await authHeaders();
    const b = await fetch("/api/admin-data", { headers: h as any }).then((r) => r.json());
    if (b.success) { setBookings(b.bookings); setStats(b.stats); }
    const m = await sb().from("movies").select("*").order("start_date", { ascending: false });
    setMovies(m.data || []);
    const st = await sb().from("settings").select("*").eq("id", 1).single();
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
      const path = `${Date.now()}-${file.name}`.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const up = await sb().storage.from("posters").upload(path, file, { upsert: true });
      if (up.error) return alert("Poster upload failed: " + up.error.message + " (create public bucket 'posters' first)");
      poster = sb().storage.from("posters").getPublicUrl(path).data.publicUrl;
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

  const verify = async () => {
    const h = await authHeaders();
    const r = await fetch("/api/verify", { method: "POST", headers: { "Content-Type": "application/json", ...(h as any) }, body: JSON.stringify({ code: qr.trim() }) }).then((r) => r.json());
    setQrRes(r.success ? `✅ VALID — ${r.booking.customer_name} • ${(r.booking.seats || []).join(", ")} • ${r.booking.show_date} ${r.booking.show_time}` : `❌ ${r.message}`);
    load();
  };

  if (!user) return (
    <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-white/10 bg-card p-6">
      <h1 className="text-center text-xl font-extrabold">🔐 Admin Login</h1>
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
      <div className="mt-2 flex gap-2">
        {(["bookings", "movies", "settings", "verify"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-2 text-sm font-bold ${tab === t ? "bg-brand text-black" : "bg-card"}`}>{t}</button>)}
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
          <div className="mt-2 flex gap-2"><input value={qr} onChange={(e) => setQr(e.target.value)} placeholder="Paste BK… code" className="flex-1 rounded-lg border border-white/15 bg-black/40 p-3 text-sm" /><button onClick={verify} className="rounded-lg bg-blue-600 px-4 font-bold">Verify</button></div>
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
