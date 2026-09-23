/* ============================================================
   FACILITY RESERVATION & APPROVAL SYSTEM — Supabase Config
   Lab 4 Section B | GitHub + GitHub Pages + Supabase
   ------------------------------------------------------------
   MODES:
   • DEMO MODE (default until you add credentials): the app runs
     fully on localStorage. All roles, workflow, business rules
     (BR-B4-01..10) and audit logs work offline.

   • SUPABASE MODE: every change is ALSO written to your cloud
     database and the app pulls from Supabase on every load, so
     bookings / users / audit logs survive across browsers.

   ┌───────────────────────────────────────────────────────────┐
   │ HOW TO CONNECT YOUR SUPABASE (3 steps)                    │
   │ 1) supabase.com → create / open your project              │
   │ 2) SQL Editor → run schema.sql (tables + RLS + seed)      │
   │ 3) Project Settings → API → copy these two values and     │
   │    PASTE them into the two ★ lines below:                 │
   │      Project URL :  https://<your-ref>.supabase.co        │
   │      anon key    :  eyJ...  or  sb_publishable_...        │
   │    Then reload index.html — the login card badge will     │
   │    switch from "Demo Mode" to "Supabase Mode".            │
   └───────────────────────────────────────────────────────────┘

   TO CHANGE SUPABASE PROJECTS: edit the two ★ lines below and
   reload. Nothing else in the app needs to change.
   ============================================================ */

/* ★ MASTER TOGGLE ★
   true  = Supabase Mode (data syncs to your cloud project)
   false = Demo Mode (data stays in this browser's localStorage)
   Your credentials below stay saved either way — just flip this. */
const USE_SUPABASE = true;

/* ★ PASTE YOUR PROJECT URL HERE ★
   Accepts https://<ref>.supabase.co  or  https://<ref>.supabase.co/rest/v1 */
const SUPABASE_URL = "https://xcxwjpyqvjpnoiwlnqlx.supabase.co/rest/v1/";

/* ★ PASTE YOUR ANON / PUBLISHABLE PUBLIC KEY HERE ★ */
const SUPABASE_ANON_KEY = "sb_publishable_jLGhGLxVj-OQiO6p2xyUtA_Ou3IMXel";

function normalizeSupabaseUrl(raw) {
  if (typeof raw !== "string") return "";
  var u = raw.trim().replace(/\/+$/g, "");
  u = u.replace(/\/rest\/v1$/i, "");
  return u;
}

const SUPABASE_BASE_URL = normalizeSupabaseUrl(SUPABASE_URL);

function isSupabaseConfigured() {
  if (!USE_SUPABASE) return false;
  if (typeof SUPABASE_BASE_URL !== "string" || typeof SUPABASE_ANON_KEY !== "string") return false;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_BASE_URL)) return false;
  if (SUPABASE_BASE_URL.indexOf("REPLACE_ME") !== -1) return false;
  if (!SUPABASE_ANON_KEY || SUPABASE_ANON_KEY.length < 20) return false;
  if (SUPABASE_ANON_KEY.indexOf("REPLACE_ME") !== -1) return false;
  return true;
}

let supabaseClient = null;
try {
  if (isSupabaseConfigured() && typeof supabase !== "undefined") {
    supabaseClient = supabase.createClient(SUPABASE_BASE_URL, SUPABASE_ANON_KEY);
  }
} catch (e) {
  console.warn("Supabase init failed, using Demo Mode.", e);
  supabaseClient = null;
}