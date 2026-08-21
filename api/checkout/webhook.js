/**
 * POST /api/checkout/webhook
 * ------------------------------------------------------------------
 * Ozow calls this URL server-to-server once a transaction concludes
 * (and again if the status changes from Pending to final). This is
 * the ONLY place an order should be marked PAID — never trust the
 * browser redirect to /success.html on its own, since a user could
 * hit that URL directly without having paid.
 *
 * Flow:
 *   1. Verify the posted Hash against a hash we compute ourselves.
 *   2. Look up the order by TransactionReference.
 *   3. Update its status based on Ozow's Status field.
 *   4. Respond 200 quickly — Ozow retries if it doesn't get one.
 *
 * Ozow may send duplicate notifications (e.g. Pending then Complete) —
 * this handler is idempotent: re-processing the same final status is safe.
 * ------------------------------------------------------------------
 */

const { getSupabase } = require("../../lib/supabase");
const { verifyNotificationHash } = require("../../lib/ozow");

// Map Ozow's Status values to our internal order status.
// TODO confirm exact string values Ozow sends (commonly: Complete, Cancelled, Error, Abandoned, PendingInvestigation)
const STATUS_MAP = {
  Complete: "PAID",
  Cancelled: "CANCELLED",
  Error: "FAILED",
  Abandoned: "FAILED",
  PendingInvestigation: "PENDING",
};

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method not allowed");
  }

  const fields = req.body || {};

  let validHash = false;
  try {
    validHash = verifyNotificationHash(fields);
  } catch (err) {
    console.error("[checkout/webhook] hash verification threw:", err);
  }

  if (!validHash) {
    console.warn("[checkout/webhook] rejected notification with invalid hash", fields.TransactionReference);
    // Respond 200 anyway so Ozow doesn't hammer retries on a payload we'll never accept —
    // but nothing gets written to the database.
    return res.status(200).send("ignored");
  }

  const orderRef = fields.TransactionReference;
  if (!orderRef) {
    return res.status(400).send("missing TransactionReference");
  }

  const newStatus = STATUS_MAP[fields.Status] || "PENDING";

  try {
    const supabase = getSupabase();
    const { error } = await supabase
      .from("orders")
      .update({
        status: newStatus,
        ozow_transaction_id: fields.TransactionId || null,
        paid_at: newStatus === "PAID" ? new Date().toISOString() : null,
      })
      .eq("reference", orderRef);

    if (error) {
      console.error("[checkout/webhook] supabase update error:", error);
      return res.status(500).send("db error");
    }

    return res.status(200).send("ok");
  } catch (err) {
    console.error("[checkout/webhook] error:", err);
    return res.status(500).send("error");
  }
};
