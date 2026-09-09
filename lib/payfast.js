/**
 * PAYFAST PAYMENT HELPER
 * ------------------------------------------------------------------
 * Wraps PayFast's "Custom Integration" redirect flow: build a signed
 * query string, send the browser to PayFast's hosted payment page,
 * PayFast posts an ITN (Instant Transaction Notification) back to our
 * webhook once the transaction concludes.
 *
 * Required environment variables (set in Vercel → Project → Settings → Environment
 * Variables, never commit these):
 *   PAYFAST_MERCHANT_ID   — from your PayFast merchant dashboard
 *   PAYFAST_MERCHANT_KEY  — from your PayFast merchant dashboard
 *   PAYFAST_PASSPHRASE    — set on your PayFast account under Settings → Integration.
 *                            Required here — without one, the ITN signature can be
 *                            reproduced by anyone who sees a single real notification,
 *                            since the signing algorithm has no other secret input.
 *   PAYFAST_SANDBOX       — "true" while testing against sandbox.payfast.co.za,
 *                            "false" once live
 *
 * ⚠️ VERIFY BEFORE LAUNCH
 * The field set/order below matches PayFast's commonly published Custom Integration
 * docs at the time of writing. PayFast's signature check is strict about field order
 * and does add optional fields over time — cross-check buildPaymentUrl()'s field
 * order and the ITN field table in verifyItnSignature() against your PayFast merchant
 * docs, and run a full sandbox transaction before taking a single real payment.
 * ------------------------------------------------------------------
 */

const crypto = require("crypto");

const SANDBOX_PROCESS_URL = "https://sandbox.payfast.co.za/eng/process";
const LIVE_PROCESS_URL = "https://www.payfast.co.za/eng/process";
const SANDBOX_VALIDATE_URL = "https://sandbox.payfast.co.za/eng/query/validate";
const LIVE_VALIDATE_URL = "https://www.payfast.co.za/eng/query/validate";

function isSandbox() {
  return (process.env.PAYFAST_SANDBOX || "true").toLowerCase() !== "false";
}

// PayFast's signature uses PHP's urlencode() convention: spaces as "+", not "%20".
function pfEncode(value) {
  return encodeURIComponent(String(value).trim()).replace(/%20/g, "+");
}

// Builds the "key=value&key=value..." string PayFast signs, in the order
// keys were added to `data`, skipping empty/undefined/null values.
function buildSignatureBase(data, passphrase) {
  const parts = [];
  for (const key of Object.keys(data)) {
    const value = data[key];
    if (value === undefined || value === null || value === "") continue;
    parts.push(key + "=" + pfEncode(value));
  }
  if (passphrase) {
    parts.push("passphrase=" + pfEncode(passphrase));
  }
  return parts.join("&");
}

function md5(input) {
  return crypto.createHash("md5").update(input).digest("hex");
}

function getPassphrase() {
  const passphrase = process.env.PAYFAST_PASSPHRASE;
  if (!passphrase) {
    throw new Error(
      "Missing PAYFAST_PASSPHRASE environment variable — required so ITN signatures can't be forged"
    );
  }
  return passphrase;
}

/**
 * Builds the signed PayFast redirect URL for a new order.
 * @param {Object} opts
 * @param {string} opts.orderRef - your own unique order reference (sent as m_payment_id)
 * @param {number} opts.amount - ZAR amount, e.g. 499.00
 * @param {string} opts.itemName - short product name shown on PayFast's page
 * @param {string} opts.returnUrl - e.g. https://treatsbymilz.co.za/success.html?order=...
 * @param {string} opts.cancelUrl - e.g. https://treatsbymilz.co.za/error.html?reason=cancelled&order=...
 * @param {string} opts.notifyUrl - your ITN webhook URL, e.g. https://treatsbymilz.co.za/api/checkout/webhook
 */
function buildPaymentUrl(opts) {
  const merchantId = process.env.PAYFAST_MERCHANT_ID;
  const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
  if (!merchantId || !merchantKey) {
    throw new Error("Missing PAYFAST_MERCHANT_ID or PAYFAST_MERCHANT_KEY environment variables");
  }
  const passphrase = getPassphrase();

  // TODO verify this exact field order against current PayFast docs before launch
  const data = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: opts.returnUrl,
    cancel_url: opts.cancelUrl,
    notify_url: opts.notifyUrl,
    m_payment_id: opts.orderRef,
    amount: Number(opts.amount).toFixed(2),
    item_name: opts.itemName,
  };

  const signature = md5(buildSignatureBase(data, passphrase));
  const queryString = Object.keys(data)
    .map(function (key) { return key + "=" + pfEncode(data[key]); })
    .concat(["signature=" + signature])
    .join("&");

  const processUrl = isSandbox() ? SANDBOX_PROCESS_URL : LIVE_PROCESS_URL;
  return processUrl + "?" + queryString;
}

/**
 * Verifies an ITN notification's signature by recomputing it from the posted
 * fields and comparing to the `signature` field PayFast sent.
 * NEVER trust a notification without this check.
 *
 * @param {Object} fields - all fields PayFast posted, including `signature`
 * TODO confirm the exact ITN field set against PayFast's current
 * "Instant Transaction Notification" documentation.
 */
function verifyItnSignature(fields) {
  const passphrase = getPassphrase();
  const data = {};
  for (const key of Object.keys(fields)) {
    if (key === "signature") continue;
    data[key] = fields[key];
  }
  const expected = md5(buildSignatureBase(data, passphrase));
  return expected === (fields.signature || "").toLowerCase();
}

/**
 * Server-to-server confirmation: re-posts the ITN fields to PayFast's own
 * validate endpoint, which should respond with the literal string "VALID".
 * PayFast recommends this in addition to the signature check, since it also
 * confirms the request actually originated from PayFast's systems.
 *
 * Note: this re-serializes the already-parsed fields rather than replaying
 * the original raw request bytes (Vercel parses the body before our handler
 * sees it) — functionally equivalent for PayFast's validator, but re-check
 * this against a real sandbox ITN if validation ever unexpectedly fails.
 */
async function validateWithPayfast(fields) {
  const validateUrl = isSandbox() ? SANDBOX_VALIDATE_URL : LIVE_VALIDATE_URL;
  const body = Object.keys(fields)
    .map(function (key) { return key + "=" + pfEncode(fields[key]); })
    .join("&");

  const res = await fetch(validateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
  });
  const text = await res.text();
  return text.trim() === "VALID";
}

module.exports = { buildPaymentUrl, verifyItnSignature, validateWithPayfast, isSandbox };
