import { createClient } from "@supabase/supabase-js";

// Public client (browser + server read paths). RLS protects writes.
export function publicSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Service-role client — API routes ONLY (never import in client components).
export function serviceSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export function isAdminEmail(email?: string | null) {
  const list = (process.env.ADMIN_EMAILS || "")
    .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (!list.length) return true; // open until you set ADMIN_EMAILS
  return !!email && list.includes(email.toLowerCase());
}
