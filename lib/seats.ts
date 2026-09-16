// Migrated from Apps Script SEAT_LAYOUT (250 seats, rows A-L front→back)
export const SEAT_LAYOUT = [14, 16, 18, 20, 21, 21, 22, 23, 23, 24, 24, 24];

export function generateSeatIds(): string[] {
  const seats: string[] = [];
  for (let r = 0; r < SEAT_LAYOUT.length; r++) {
    const row = String.fromCharCode(65 + r);
    for (let n = 1; n <= SEAT_LAYOUT[r]; n++) seats.push(`${row}${n}`);
  }
  return seats;
}

export function validSeatSet(): Set<string> {
  return new Set(generateSeatIds());
}

export type Pricing = {
  ticketAmount: number;
  gstPercent: number;
  gst: number;
  convenienceFee: number;
  total: number;
};

export function calcPricing(
  count: number,
  ticketPrice: number,
  gstPercent: number,
  convenienceFee: number
): Pricing {
  const ticketAmount = count * ticketPrice;
  const gst = (ticketAmount * gstPercent) / 100;
  const convenience = count * convenienceFee;
  return { ticketAmount, gstPercent, gst, convenienceFee: convenience, total: ticketAmount + gst + convenience };
}

export const inr = (n: number) =>
  Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const displayDate = (iso: string) => {
  const p = String(iso || "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : iso;
};

export const parseTimings = (v: string) =>
  String(v || "").split(/[,\n]+/).map((x) => x.trim()).filter(Boolean);

export const TOTAL_SEATS = SEAT_LAYOUT.reduce((a, b) => a + b, 0);

// "2:30 PM" -> minutes since midnight. null if unparseable.
export function parseTimeToMinutes(t: string): number | null {
  const s = String(t || "").trim().toUpperCase();
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] || 0);
  const ap = m[3] || "";
  if (min > 59) return null;
  if (ap) {
    if (h < 1 || h > 12) return null;
    if (ap === "AM" && h === 12) h = 0;
    if (ap === "PM" && h !== 12) h += 12;
  } else if (h > 23) return null;
  return h * 60 + min;
}

const TZ = "Asia/Kolkata";

export function kolkataToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

export function kolkataNowMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
  const [h, m] = parts.split(":").map(Number);
  return h * 60 + m;
}

// True when the show already started (or date is past) — booking must be blocked.
export function isShowStarted(dateISO: string, timing: string): boolean {
  const today = kolkataToday();
  if (!dateISO) return false;
  if (dateISO < today) return true;
  if (dateISO > today) return false;
  const mins = parseTimeToMinutes(timing);
  if (mins === null) return false;
  return kolkataNowMinutes() >= mins;
}

// Online sales close 15 minutes before showtime; counter sales continue.
export const BOOKING_CUTOFF_MINUTES = 15;

export function isBookingClosed(dateISO: string, timing: string): boolean {
  const today = kolkataToday();
  if (!dateISO) return false;
  if (dateISO < today) return true;
  if (dateISO > today) return false;
  const mins = parseTimeToMinutes(timing);
  if (mins === null) return false;
  return kolkataNowMinutes() >= mins - BOOKING_CUTOFF_MINUTES;
}
