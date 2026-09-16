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
