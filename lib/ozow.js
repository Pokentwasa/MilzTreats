/**
 * OZOW PAYMENT HELPER
 * ------------------------------------------------------------------
 * Wraps Ozow's Direct API ("PostPaymentRequest") integration.
 *
 * Required environment variables (set in Vercel → Project → Settings → Environment Variables,
 * never commit these):
 *   OZOW_SITE_CODE     — from your Ozow merchant admin
 *   OZOW_PRIVATE_KEY   — from your Ozow merchant admin (used for hashing only, never sent as-is)
 *   OZOW_API_KEY       — from your Ozow merchant admin (sent as ApiKey header)
 *   OZOW_API_URL       — https://stagingapi.ozow.com/PostPaymentRequest while testing,
 *                         https://api.ozow.com/PostPaymentRequest once live
 *   OZOW_IS_TEST       — "true" while testing, "false" once live
 *
 * ⚠️ VERIFY BEFORE LAUNCH
 * Ozow's HashCheck field order is: concatenate the request fields (excluding HashCheck)
 * in the exact order Ozow's current docs specify, append the private key, lowercase the
 * whole string, then SHA512 it. The order below matches Ozow's commonly published Direct
 * API field order as of this writing, but Ozow does update optional fields from time to
 * time — cross-check this against your own merchant dashboard's API docs / Postman
 * collection before taking a single real payment. Same goes for verifyNotificationHash()
 * and the exact notification field table.
 * ------------------------------------------------------------------
 */

const crypto = require("crypto");

function sha512Lowercase(input) {
  return crypto.createHash("sha512").update(input.toLowerCase()).digest("hex");
}

/**
 * Builds the payload Ozow's PostPaymentRequest API expects and signs it.
 * @param {Object} opts
 * @param {string} opts.transactionReference - your own unique order reference (e.g. order.id)
 * @param {string} opts.bankReference - short reference shown on the customer's bank statement (max ~20 chars)
 * @param {number} opts.amount - ZAR amount, e.g. 499.00
 * @param {string} opts.notifyUrl - your webhook URL, e.g. https://treatsbymilz.co.za/api/checkout/webhook
 * @param {string} opts.successUrl - e.g. https://treatsbymilz.co.za/success.html
 * @param {string} opts.errorUrl - e.g. https://treatsbymilz.co.za/error.html?reason=failed
 * @param {string} opts.cancelUrl - e.g. https://treatsbymilz.co.za/error.html?reason=cancelled
 */
function buildPaymentRequest(opts) {
  const siteCode = process.env.OZOW_SITE_CODE;
  const privateKey = process.env.OZOW_PRIVATE_KEY;
  const isTest = (process.env.OZOW_IS_TEST || "false").toLowerCase() === "true" ? "true" : "false";

  if (!siteCode || !privateKey) {
    throw new Error("Missing OZOW_SITE_CODE or OZOW_PRIVATE_KEY environment variables");
  }

  const countryCode = "ZA";
  const currencyCode = "ZAR";
  const amount = Number(opts.amount).toFixed(2);

  // TODO verify this exact field order against current Ozow docs before launch
  const hashSource = [
    siteCode,
    countryCode,
    currencyCode,
    amount,
    opts.transactionReference,
    opts.bankReference,
    opts.notifyUrl,
    opts.successUrl,
    opts.errorUrl,
    opts.cancelUrl,
    isTest,
    privateKey,
  ].join("");

  const hashCheck = sha512Lowercase(hashSource);

  return {
    SiteCode: siteCode,
    CountryCode: countryCode,
    CurrencyCode: currencyCode,
    Amount: amount,
    TransactionReference: opts.transactionReference,
    BankReference: opts.bankReference,
    NotifyUrl: opts.notifyUrl,
    SuccessUrl: opts.successUrl,
    ErrorUrl: opts.errorUrl,
    CancelUrl: opts.cancelUrl,
    IsTest: isTest,
    HashCheck: hashCheck,
  };
}

/**
 * Calls Ozow's API to create the payment request and get back a redirect URL.
 */
async function createPaymentRequest(opts) {
  const apiUrl = process.env.OZOW_API_URL;
  const apiKey = process.env.OZOW_API_KEY;
  if (!apiUrl || !apiKey) {
    throw new Error("Missing OZOW_API_URL or OZOW_API_KEY environment variables");
  }

  const payload = buildPaymentRequest(opts);

  const res = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ApiKey: apiKey,
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(function () { return ""; });
    throw new Error("Ozow API error (" + res.status + "): " + text);
  }

  const data = await res.json();
  // Ozow returns { url, paymentRequestId, errorMessage, ... } — check errorMessage even on 200s
  if (data.errorMessage) {
    throw new Error("Ozow rejected the request: " + data.errorMessage);
  }
  if (!data.url) {
    throw new Error("Ozow response did not include a payment url");
  }

  return { paymentUrl: data.url, paymentRequestId: data.paymentRequestId };
}

/**
 * Verifies a webhook notification (or redirect callback) actually came from Ozow
 * by recomputing the hash server-side and comparing it to the Hash field received.
 * NEVER trust a notification/redirect without this check.
 *
 * @param {Object} fields - all fields Ozow posted, including `Hash`
 * TODO confirm the exact notification field order against Ozow's current
 * "Notification Fields" table in your merchant docs.
 */
function verifyNotificationHash(fields) {
  const privateKey = process.env.OZOW_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing OZOW_PRIVATE_KEY environment variable");

  const orderedKeys = [
    "SiteCode",
    "TransactionId",
    "TransactionReference",
    "Amount",
    "Status",
    "Optional1",
    "Optional2",
    "Optional3",
    "Optional4",
    "Optional5",
    "CurrencyCode",
    "IsTest",
    "StatusMessage",
  ];

  const source = orderedKeys.map(function (key) { return fields[key] != null ? fields[key] : ""; }).join("") + privateKey;
  const expected = sha512Lowercase(source);

  return expected === (fields.Hash || "").toLowerCase();
}

module.exports = { buildPaymentRequest, createPaymentRequest, verifyNotificationHash };
