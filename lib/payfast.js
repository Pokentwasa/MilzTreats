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
 * buildPaymentUrl()'s field set/order matches PayFast's commonly published
 * Custom Integration docs at the time of writing — PayFast's signature check
 * is strict about field order and does add optional fields over time, so
 * cross-check it against your PayFast merchant docs before taking payments.
 * verifyItnSignature()/validateWithPayfast() operate on the raw ITN request
 * body directly (see api/checkout/webhook.js), which sidesteps needing to
 * know PayFast's exact ITN field order/set at all.
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
 * @param {number} opts.amount - ZAR amount, e.g. 160.00
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
 * Verifies an ITN notification's signature by recomputing it from the RAW
 * POST body PayFast sent, not from a parsed-and-re-serialized fields object.
 * NEVER trust a notification without this check.
 *
 * This must operate on the original bytes: re-encoding a decoded value with
 * encodeURIComponent doesn't always match PHP's urlencode() byte-for-byte
 * (e.g. `!`, `*`, `'`, `(`, `)`, `~` are escaped differently), so rebuilding
 * the signature base from a parsed object can silently produce the wrong
 * signature. Splitting the raw body on "&" preserves each field's exact
 * original encoding; only the (already-decoded) `signature` field itself is
 * dropped by name.
 *
 * @param {string} rawBody - the exact request body PayFast POSTed, unparsed
 * @param {string} receivedSignature - the decoded `signature` field value
 */
function verifyItnSignature(rawBody, receivedSignature) {
  const passphrase = getPassphrase();
  const withoutSignature = rawBody
    .split("&")
    .filter(function (pair) { return pair.slice(0, "signature=".length) !== "signature="; })
    .join("&");
  const base = withoutSignature + "&passphrase=" + pfEncode(passphrase);
  const expected = md5(base);
  return expected === (receivedSignature || "").toLowerCase();
}

/**
 * Server-to-server confirmation: re-posts the ITN notification's exact raw
 * body to PayFast's own validate endpoint, which should respond with the
 * literal string "VALID". PayFast recommends this in addition to the
 * signature check, since it also confirms the request actually originated
 * from PayFast's systems. Reposting the raw bytes (rather than a
 * re-serialized fields object) avoids the same encoding mismatches
 * verifyItnSignature() guards against.
 *
 * @param {string} rawBody - the exact request body PayFast POSTed, unparsed
 */
async function validateWithPayfast(rawBody) {
  const validateUrl = isSandbox() ? SANDBOX_VALIDATE_URL : LIVE_VALIDATE_URL;

  const res = await fetch(validateUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: rawBody,
  });
  const text = await res.text();
  return text.trim() === "VALID";
}

module.exports = { buildPaymentUrl, verifyItnSignature, validateWithPayfast, isSandbox };
