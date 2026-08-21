/**
 * POST /api/checkout/initiate
 * ------------------------------------------------------------------
 * 1. Creates an order row with status PENDING in Supabase.
 * 2. Asks Ozow for a hosted payment URL for that order.
 * 3. Returns { paymentUrl } for the browser to redirect to.
 *
 * The frontend never sees pricing logic or Ozow credentials — it only
 * gets back a URL. Amount is taken from COURSE_PRICE below, not from
 * whatever the client posted, so a tampered request body can't change
 * what gets charged.
 * ------------------------------------------------------------------
 */

const { getSupabase } = require("../../lib/supabase");
const { createPaymentRequest } = require("../../lib/ozow");
const crypto = require("crypto");

// TODO keep this in sync with js/site-config.js course.price, or better,
// move both to read from a single shared source (e.g. a Supabase `products` row)
const COURSE_PRICE = 499.0;
const SITE_URL = process.env.SITE_URL || "https://treatsbymilz.co.za";

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const supabase = getSupabase();

    const orderRef = "TBM-" + crypto.randomBytes(5).toString("hex").toUpperCase();

    const { error: insertError } = await supabase.from("orders").insert({
      reference: orderRef,
      product: "digital-baking-course",
      amount: COURSE_PRICE,
      status: "PENDING",
    });

    if (insertError) {
      console.error("[checkout/initiate] supabase insert error:", insertError);
      return res.status(500).json({ error: "Could not create order" });
    }

    const { paymentUrl, paymentRequestId } = await createPaymentRequest({
      transactionReference: orderRef,
      bankReference: "TREATSBYMILZ",
      amount: COURSE_PRICE,
      notifyUrl: SITE_URL + "/api/checkout/webhook",
      successUrl: SITE_URL + "/success.html?order=" + orderRef,
      errorUrl: SITE_URL + "/error.html?reason=failed&order=" + orderRef,
      cancelUrl: SITE_URL + "/error.html?reason=cancelled&order=" + orderRef,
    });

    await supabase
      .from("orders")
      .update({ ozow_payment_request_id: paymentRequestId, status: "PAYMENT_INITIATED" })
      .eq("reference", orderRef);

    return res.status(200).json({ paymentUrl: paymentUrl, order: orderRef });
  } catch (err) {
    console.error("[checkout/initiate] error:", err);
    return res.status(500).json({ error: "Could not start checkout" });
  }
};
