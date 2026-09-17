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

type ScanEntry = {
  code: string;
  ok: boolean;
  message: string;
  detail: string;
  time: string;
  seats: number;
};

function beep(ok: boolean) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = ok ? 880 : 220;
    o.type = "sine";
    g.gain.value = 0.15;
    o.start();
    setTimeout(() => { try { o.stop(); ctx.close(); } catch {} }, ok ? 120 : 300);
  } catch {}
}

export default function FastVerifyPage() {
  const [user, setUser] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [cameraOn, setCameraOn] = useState(false);
  const [camErr, setCamErr] = useState("");
  const [manual, setManual] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<ScanEntry | null>(null);
  const [history, setHistory] = useState<ScanEntry[]>([]);
  const [counts, setCounts] = useState({ ok: 0, used: 0, bad: 0 });
  const qrRef = useRef<any>(null);
  const lastCode = useRef("");
  const lastAt = useRef(0);
  const inFlight = useRef<Set<string>>(new Set());

  useEffect(() => {
    try { getClient()?.auth.getUser().then(({ data }: any) => setUser(data.user || null)).catch(() => {}); } catch {}
  }, []);

  const login = async () => {
    setMsg("");
    const c = getClient();
    if (!c) return setMsg("App keys missing. Add env vars and redeploy.");
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) return setMsg(error.message);
    setUser(data.user);
  };
  const logout = async () => { try { await getClient()?.auth.signOut(); } catch {} setUser(null); stopCam(); };

  const token = async () => {
    try {
      const { data } = await getClient()?.auth.getSession();
      return data.session?.access_token || "";
    } catch { return ""; }
  };

  const verify = async (raw: string) => {
    const code = String(raw || "").trim();
    if (!code) return;
    // Debounce: ignore same QR re-read within 3s (camera fires many frames per second)
    const now = Date.now();
    if (code === lastCode.current && now - lastAt.current < 3000) return;
    if (inFlight.current.has(code)) return;
    lastCode.current = code; lastAt.current = now;
    inFlight.current.add(code);
    setBusy(true);
    try {
      const t = await token();
      const r = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": t },
        body: JSON.stringify({ code }),
      }).then((x) => x.json());
      const seatList: string[] = r.booking?.seats || [];
      const entry: ScanEntry = r.success
        ? { code, ok: true, message: `VALID (${seatList.length} seat${seatList.length === 1 ? "" : "s"})`, detail: `${r.booking?.customer_name || ""} • ${seatList.join(", ")} • ${r.booking?.show_date || ""} ${r.booking?.show_time || ""}`, time: new Date().toLocaleTimeString("en-IN"), seats: seatList.length }
        : { code, ok: false, message: String(r.message || "Invalid").replace(/❌|⚠️/g, "").trim(), detail: r.booking ? `${r.booking?.customer_name || ""} • ${seatList.join(", ")}` : "", time: new Date().toLocaleTimeString("en-IN"), seats: seatList.length };
      setLast(entry);
      setHistory((h) => [entry, ...h].slice(0, 50));
      setCounts((c) => entry.ok ? { ...c, ok: c.ok + 1 } : /ALREADY USED/i.test(entry.message) ? { ...c, used: c.used + 1 } : { ...c, bad: c.bad + 1 });
      beep(entry.ok);
    } catch (e: any) {
      const entry: ScanEntry = { code, ok: false, message: e?.message || "Network error", detail: "", time: new Date().toLocaleTimeString("en-IN"), seats: 0 };
      setLast(entry);
      setHistory((h) => [entry, ...h].slice(0, 50));
      setCounts((c) => ({ ...c, bad: c.bad + 1 }));
      beep(false);
    } finally {
      inFlight.current.delete(code);
      setBusy(false);
    }
  };

  const startCam = async () => {
    setCamErr("");
    if (qrRef.current) return;
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      const qr = new Html5Qrcode("fast-qr-reader", { verbose: false });
      qrRef.current = qr;
      const config: any = {
        fps: 20,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0,
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
      };
      await qr.start(
        { facingMode: "environment" },
        config,
        (text: string) => { verify(text); }, // keep running — rapid next-QR
        () => {}
      );
      setCameraOn(true);
    } catch (e: any) {
      qrRef.current = null;
      setCameraOn(false);
      setCamErr("Camera failed: " + (e?.message || "permission denied. Use HTTPS and allow camera."));
    }
  };

  const stopCam = async () => {
    try { await qrRef.current?.stop(); } catch {}
    try { await qrRef.current?.clear(); } catch {}
    qrRef.current = null;
    setCameraOn(false);
  };

  useEffect(() => () => { try { qrRef.current?.stop(); } catch {} try { qrRef.current?.clear(); } catch {} }, []);

  if (!user) return (
    <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-white/10 bg-card p-6">
      <h1 className="text-center text-xl font-extrabold">⚡ Fast Ticket Scan</h1>
      <p className="mb-3 mt-1 text-center text-xs text-slate-400">Admin login required (marks tickets Used on verify)</p>
      <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="mb-2 w-full rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
      <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Password" className="mb-2 w-full rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
      <button onClick={login} className="w-full rounded-lg bg-green-700 p-3 font-bold">Login & Scan</button>
      {msg && <div className="mt-2 text-center text-xs text-red-300">{msg}</div>}
    </div>
  );

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-extrabold">⚡ Fast Scan <span className="text-xs font-normal text-slate-400">auto-verify • rapid next</span></h1>
        <button onClick={logout} className="rounded-lg bg-red-600 px-3 py-2 text-sm font-bold">Logout</button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-card p-3"><div className="text-xs text-green-400">Valid</div><div className="text-xl font-extrabold">{counts.ok}</div></div>
        <div className="rounded-xl bg-card p-3"><div className="text-xs text-yellow-400">Already used</div><div className="text-xl font-extrabold">{counts.used}</div></div>
        <div className="rounded-xl bg-card p-3"><div className="text-xs text-red-400">Invalid</div><div className="text-xl font-extrabold">{counts.bad}</div></div>
      </div>

      <div className="mt-3 rounded-xl bg-card p-4">
        {!cameraOn
          ? <button onClick={startCam} className="w-full rounded-lg bg-green-700 p-3.5 font-extrabold">📷 Start Fast Camera</button>
          : <button onClick={stopCam} className="w-full rounded-lg bg-red-700 p-3 text-sm font-bold">⏹ Stop Camera</button>}
        {camErr && <div className="mt-2 text-center text-xs text-red-300">{camErr}</div>}
        <div id="fast-qr-reader" className="mt-2 overflow-hidden rounded-lg" />
        <p className="mt-1 text-center text-[11px] text-slate-500">Point at QR — it verifies automatically, keep camera running for the next ticket.</p>
      </div>

      {last && (
        <div className={`mt-3 rounded-xl p-4 text-center font-extrabold ${last.ok ? "bg-green-600" : "bg-red-700"}`}>
          <div className="text-2xl">{last.ok ? "✅ " + last.message : "❌ " + last.message}</div>
          <div className="mt-1 break-all text-sm font-bold">{last.code}</div>
          {last.detail && <div className="mt-0.5 text-xs font-normal opacity-90">{last.detail}</div>}
        </div>
      )}

      <div className="mt-3 rounded-xl bg-card p-4">
        <h2 className="text-sm font-bold">⌨️ Manual entry {busy && <span className="text-xs font-normal text-yellow-300">(verifying…)</span>}</h2>
        <div className="mt-2 flex gap-2">
          <input value={manual} onChange={(e) => setManual(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { verify(manual); setManual(""); } }} placeholder="Type / paste BK… code + Enter" className="flex-1 rounded-lg border border-white/15 bg-black/40 p-3 text-sm" />
          <button onClick={() => { verify(manual); setManual(""); }} className="rounded-lg bg-blue-600 px-4 font-bold">Verify</button>
        </div>
      </div>

      <div className="mt-3 rounded-xl bg-card p-4">
        <div className="flex items-center"><h2 className="flex-1 text-sm font-bold">🧾 Recent scans ({history.length})</h2><button onClick={() => { setHistory([]); setLast(null); setCounts({ ok: 0, used: 0, bad: 0 }); }} className="rounded bg-slate-700 px-2 py-1 text-xs">Clear</button></div>
        <div className="mt-2 grid max-h-[300px] gap-1.5 overflow-y-auto">
          {history.map((h, i) => (
            <div key={i} className={`rounded-lg border p-2 text-xs ${h.ok ? "border-green-700 bg-green-900/30" : "border-red-800 bg-red-900/30"}`}>
              <b>{h.ok ? "✅" : "❌"} {h.code}</b> <span className="text-slate-300">— {h.message}</span>
              {h.detail && <div className="text-slate-400">{h.detail}</div>}
              <div className="text-[10px] text-slate-500">{h.time}</div>
            </div>
          ))}
          {!history.length && <div className="p-4 text-center text-sm text-slate-500">No scans yet — start the camera.</div>}
        </div>
      </div>
    </div>
  );
}
