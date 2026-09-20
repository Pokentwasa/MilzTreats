/**
 * POST /api/checkout/initiate
 * ------------------------------------------------------------------
 * 1. Validates the short "about you" questionnaire answers.
 * 2. Creates an order row with status PENDING in Supabase, including
 *    those answers, so they're saved before the customer ever leaves
 *    for PayFast — no payment happens without this row existing first.
 * 3. Builds a signed PayFast redirect URL for that order (unchanged
 *    from the existing PayFast integration).
 * 4. Returns { paymentUrl } for the browser to redirect to.
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

// TEMP: price dropped to R5 for a live payment test — restore to 160.0 after.
// TODO keep this in sync with js/site-config.js course.price, or better,
// move both to read from a single shared source (e.g. a Supabase `products` row)
const COURSE_PRICE = 5.0;
const SITE_URL = process.env.SITE_URL || "https://treatsbymilz.co.za";

// Must match the <option> values in checkout.html's customer info form.
const GOAL_OPTIONS = [
  "Baking as a hobby",
  "I want to start a baking business",
  "I already have a baking business",
  "Other",
];
const PROVINCE_OPTIONS = [
  "Eastern Cape",
  "Free State",
  "Gauteng",
  "KwaZulu-Natal",
  "Limpopo",
  "Mpumalanga",
  "North West",
  "Northern Cape",
  "Western Cape",
  "Outside South Africa",
];

function validateCustomerInfo(body) {
  const goal = typeof body.customerGoal === "string" ? body.customerGoal.trim() : "";
  const province = typeof body.province === "string" ? body.province.trim() : "";

  if (!GOAL_OPTIONS.includes(goal)) {
    return { error: "Missing or invalid customerGoal" };
  }
  if (!PROVINCE_OPTIONS.includes(province)) {
    return { error: "Missing or invalid province" };
  }

  let goalOther = "";
  if (goal === "Other") {
    goalOther = typeof body.customerGoalOther === "string" ? body.customerGoalOther.trim() : "";
    if (!goalOther) return { error: "customerGoalOther is required when customerGoal is Other" };
    goalOther = goalOther.slice(0, 200);
  }

  let country = "";
  if (province === "Outside South Africa") {
    country = typeof body.country === "string" ? body.country.trim() : "";
    if (!country) return { error: "country is required when province is Outside South Africa" };
    country = country.slice(0, 100);
  }

  return { value: { goal, goalOther, province, country } };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const body = req.body || {};
  const { value: customerInfo, error: customerInfoError } = validateCustomerInfo(body);
  if (customerInfoError) {
    return res.status(400).json({ error: customerInfoError });
  }

  try {
    const supabase = getSupabase();

    const orderRef = "TBM-" + crypto.randomBytes(5).toString("hex").toUpperCase();

    const { error: insertError } = await supabase.from("orders").insert({
      reference: orderRef,
      product: "digital-baking-course",
      amount: COURSE_PRICE,
      status: "PENDING",
      customer_goal: customerInfo.goal,
      customer_goal_other: customerInfo.goalOther || null,
      province: customerInfo.province,
      country: customerInfo.country || null,
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
