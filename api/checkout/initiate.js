/**
 * POST /api/checkout/initiate
 * ------------------------------------------------------------------
 * 1. Creates an order row with status PENDING in Supabase.
 * 2. Builds a signed PayFast redirect URL for that order.
 * 3. Returns { paymentUrl } for the browser to redirect to.
 *
 * The frontend never sees pricing logic or PayFast credentials — it only
 * gets back a URL. Amount is taken from COURSE_PRICE below, not from
 * whatever the client posted, so a tampered request body can't change
 * what gets charged.
 * ------------------------------------------------------------------
 */

const { getSupabase } = require("../../lib/supabase");
const { buildPaymentUrl } = require("../../lib/payfast");
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

    const paymentUrl = buildPaymentUrl({
      orderRef: orderRef,
      amount: COURSE_PRICE,
      itemName: "Treats by Milz — Digital Baking Course",
      notifyUrl: SITE_URL + "/api/checkout/webhook",
      returnUrl: SITE_URL + "/success.html?order=" + orderRef,
      cancelUrl: SITE_URL + "/error.html?reason=cancelled&order=" + orderRef,
    });

    await supabase
      .from("orders")
      .update({ status: "PAYMENT_INITIATED" })
      .eq("reference", orderRef);

    return res.status(200).json({ paymentUrl: paymentUrl, order: orderRef });
  } catch (err) {
    console.error("[checkout/initiate] error:", err);
    return res.status(500).json({ error: "Could not start checkout" });
  }
};
