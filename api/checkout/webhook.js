/**
 * POST /api/checkout/webhook
 * ------------------------------------------------------------------
 * PayFast calls this URL server-to-server once a transaction concludes
 * (ITN — Instant Transaction Notification). This is the ONLY place an
 * order should be marked PAID — never trust the browser redirect to
 * /success.html on its own, since a user could hit that URL directly
 * without having paid.
 *
 * Flow:
 *   1. Verify the posted `signature` against a signature we compute ourselves.
 *   2. Confirm the notification with PayFast's own validate endpoint.
 *   3. Look up the order by `m_payment_id` and confirm `amount_gross` matches
 *      what we actually charged — never trust the amount PayFast echoes back
 *      on its own, in case of a tampered or replayed request.
 *   4. Update its status based on PayFast's `payment_status` field.
 *   5. Respond 200 quickly — PayFast retries if it doesn't get one.
 *
 * PayFast may send duplicate notifications — this handler is idempotent:
 * re-processing the same final status is safe.
 * ------------------------------------------------------------------
 */

const { getSupabase } = require("../../lib/supabase");
const { verifyItnSignature, validateWithPayfast } = require("../../lib/payfast");

// Body parsing is turned off below so this handler sees PayFast's raw POST
// bytes — verifyItnSignature()/validateWithPayfast() need the exact original
// encoding, not a parsed-and-re-serialized object (see lib/payfast.js).
module.exports.config = { api: { bodyParser: false } };

// Map PayFast's payment_status values to our internal order status.
// TODO confirm exact string values against PayFast's current ITN docs
// (commonly: COMPLETE, FAILED, CANCELLED, PENDING)
const STATUS_MAP = {
  COMPLETE: "PAID",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  PENDING: "PENDING",
};

function readRawBody(req) {
  return new Promise(function (resolve, reject) {
    const chunks = [];
    req.on("data", function (chunk) { chunks.push(chunk); });
    req.on("end", function () { resolve(Buffer.concat(chunks).toString("utf8")); });
    req.on("error", reject);
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).send("Method not allowed");
  }

  const rawBody = await readRawBody(req);
  // Decoded fields are fine for business logic (order lookup, status,
  // amount) — only signature verification needs the raw bytes.
  const fields = Object.fromEntries(new URLSearchParams(rawBody));

  let validSignature = false;
  try {
    validSignature = verifyItnSignature(rawBody, fields.signature);
  } catch (err) {
    console.error("[checkout/webhook] signature verification threw:", err);
  }

  if (!validSignature) {
    console.warn("[checkout/webhook] rejected notification with invalid signature", fields.m_payment_id);
    // Respond 200 anyway so PayFast doesn't hammer retries on a payload we'll never accept —
    // but nothing gets written to the database.
    return res.status(200).send("ignored");
  }

  try {
    const confirmed = await validateWithPayfast(rawBody);
    if (!confirmed) {
      console.warn("[checkout/webhook] PayFast validate endpoint rejected notification", fields.m_payment_id);
      return res.status(200).send("ignored");
    }
  } catch (err) {
    console.error("[checkout/webhook] validate call failed:", err);
    return res.status(500).send("validate error");
  }

  const orderRef = fields.m_payment_id;
  if (!orderRef) {
    return res.status(400).send("missing m_payment_id");
  }

  const newStatus = STATUS_MAP[fields.payment_status] || "PENDING";

  try {
    const supabase = getSupabase();

    const { data: order, error: fetchError } = await supabase
      .from("orders")
      .select("amount")
      .eq("reference", orderRef)
      .single();

    if (fetchError || !order) {
      console.error("[checkout/webhook] order not found:", orderRef);
      return res.status(404).send("order not found");
    }

    const expectedAmount = Number(order.amount).toFixed(2);
    const receivedAmount = Number(fields.amount_gross).toFixed(2);
    if (newStatus === "PAID" && expectedAmount !== receivedAmount) {
      console.error(
        "[checkout/webhook] amount mismatch for", orderRef, "expected", expectedAmount, "got", receivedAmount
      );
      return res.status(400).send("amount mismatch");
    }

    const { error } = await supabase
      .from("orders")
      .update({
        status: newStatus,
        provider_transaction_id: fields.pf_payment_id || null,
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
