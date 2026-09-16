# Sandhya Cine House — Vercel + Supabase (migrated from Apps Script)

Modern, user-friendly movie ticket booking. Same 250-seat layout (rows A–L), pricing with GST + convenience fee, QR tickets, admin dashboard.

## 1) Create Supabase project (5 min, free)

1. Go to supabase.com → New project → copy **Project URL** + **anon key** + **service_role key** (Settings → API).
2. SQL Editor → New query → paste entire `supabase/schema.sql` → Run.
3. Storage → New bucket → name `posters` → **Public ON**.
4. Authentication → Users → Add user → e.g. `you@example.com / strong-password` (this is your admin login).

## 2) Run locally

Install Node.js 20 LTS from nodejs.org, then:

```bash
npm install
cp .env.example .env.local
# edit .env.local with your Supabase URL + keys + ADMIN_EMAILS=you@example.com
npm run dev
```

Open http://localhost:3000 — customer booking. Admin at http://localhost:3000/admin.

## 3) Deploy to Vercel (free)

1. Push this folder to GitHub (new repo).
2. vercel.com → Add New Project → Import repo → add Environment Variables (same as `.env.local`, plus `NEXT_PUBLIC_SITE_URL=https://your-app.vercel.app`).
3. Deploy. Every `git push` auto-redeploys.

## 4) Email tickets (optional, Resend)

1. resend.com → API key → add `RESEND_API_KEY` + `TICKET_FROM_EMAIL` in Vercel env.
2. Bookings succeed even without email; ticket + QR always show on screen.

## What changed vs Apps Script

- Sheets → Postgres tables `settings`, `movies`, `bookings` (see schema).
- Drive posters → Supabase Storage `posters` bucket (public URLs).
- CacheService admin token → Supabase Auth email login + `ADMIN_EMAILS` allowlist.
- MailApp → Resend API (`/api/send-ticket`).
- QR = booking code only (same as before) → `/api/verify` marks Used/Cancelled.
- Seat conflicts checked server-side in `/api/book` for the exact 250-seat map.

## Migrating old data

Export your Google Sheet tabs as CSV → Supabase Table Editor → Import CSV into matching tables:
- Shows → movies (split "Show Timings" comma string into `timings` array)
- Bookings → bookings (map "Booking ID" → `booking_code`, "Show" `S1::7 PM` → `movie_id` + `show_time`)
