/**
 * SUPABASE HELPER (server-side only)
 * ------------------------------------------------------------------
 * Required environment variables:
 *   SUPABASE_URL              — Project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Service role key (NEVER expose this to the
 *                                frontend — server/API routes only)
 *
 * Uses the service role key because these API routes need to read/write
 * the `orders` table regardless of RLS — RLS should still be enabled on
 * the table to block direct client access.
 * ------------------------------------------------------------------
 */

const { createClient } = require("@supabase/supabase-js");

let client = null;

function getSupabase() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables");
  }

  client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return client;
}

module.exports = { getSupabase };
