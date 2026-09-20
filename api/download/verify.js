/**
 * GET /api/download/verify?order=TBM-XXXXXXXXXX
 * ------------------------------------------------------------------
 * Looks up the order, confirms it's PAID, and only then asks Supabase
 * Storage for a short-lived signed URL to the course ZIP. The ZIP
 * itself lives in a PRIVATE bucket — it has no public URL, so this
 * route is the only path to it.
 *
 * Storage setup (once):
 *   - Create a private bucket, e.g. "course-files"
 *   - Upload the file at COURSE_ZIP_PATH below
 *   - Leave the bucket private (no public read policy)
 * ------------------------------------------------------------------
 */

const { getSupabase } = require("../../lib/supabase");

const BUCKET = "course-files";
const COURSE_ZIP_PATH = "Get started with me_2026.zip"; // must match the uploaded file path exactly
const SIGNED_URL_TTL_SECONDS = 60 * 15; // 15 minutes

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const orderRef = req.query.order;
  if (!orderRef) {
    return res.status(400).json({ error: "Missing order reference" });
  }

  try {
    const supabase = getSupabase();

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("status")
      .eq("reference", orderRef)
      .single();

    if (fetchError || !order) {
      return res.status(404).json({ error: "Order not found" });
    }

    if (order.status !== "PAID") {
      // Covers PENDING (webhook hasn't landed yet), FAILED, CANCELLED
      return res.status(402).json({ error: "Payment not confirmed yet", status: order.status });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(COURSE_ZIP_PATH, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) {
      console.error("[download/verify] signed url error:", signError);
      return res.status(500).json({ error: "Could not generate download link" });
    }

    return res.status(200).json({ downloadUrl: signed.signedUrl, expiresInSeconds: SIGNED_URL_TTL_SECONDS });
  } catch (err) {
    console.error("[download/verify] error:", err);
    return res.status(500).json({ error: "Something went wrong" });
  }
};
