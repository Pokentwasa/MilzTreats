# Treats by Milz

A single-page site selling one digital product — a downloadable baking
course — with Ozow as the payment provider and Supabase handling orders
and secure file delivery.

## What's here

```
index.html              Main site (all 12 sections)
checkout.html           Starts an order + redirects to Ozow
success.html            Post-payment "you're in" screen + secure download
error.html              Payment failed/cancelled screen

css/style.css            All styles
js/site-config.js        Edit course name, price, modules, socials here
js/main.js                Nav, accordion/card rendering, scroll reveals, magnetic buttons

api/checkout/initiate.js  Creates a PENDING order, gets an Ozow payment URL
api/checkout/webhook.js   Ozow's server-to-server confirmation — source of truth
api/download/verify.js    Issues a short-lived signed download URL, only if PAID

lib/ozow.js                Ozow hash + API request helper
lib/supabase.js            Supabase server client
```

No build step. This is plain HTML/CSS/JS + a handful of serverless
functions — push to GitHub, connect the repo in Vercel, done. Vercel
auto-detects the `/api` folder as serverless functions.

## What to edit before launch

Everything content-related lives in **`js/site-config.js`**: course
name, price, the 6 modules (used by both the "What You'll Learn" cards
and the "Your Baking Journey" accordion), zip filename, socials, email.

Everything visual (photography) is currently a styled placeholder block
(`.ph-block`) with a label — search `index.html` for `ph-block` and swap
each one for a real `<img>` once Milz's photography is ready. The
layout, aspect ratios and spacing are already sized for this.

**`api/checkout/initiate.js`** hardcodes `COURSE_PRICE` separately from
`js/site-config.js` (server code can't read a browser JS file) — keep
these two numbers in sync, or move the price into a `products` table in
Supabase and have both read from there.

## Supabase setup

1. Create a project at supabase.com.
2. Run this SQL in the SQL editor:

```sql
create table orders (
  id uuid primary key default gen_random_uuid(),
  reference text unique not null,
  product text not null,
  amount numeric(10,2) not null,
  status text not null default 'PENDING', -- PENDING, PAYMENT_INITIATED, PAID, FAILED, CANCELLED
  ozow_payment_request_id text,
  ozow_transaction_id text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table orders enable row level security;
-- No policies added on purpose: the API routes use the service role key,
-- which bypasses RLS. This means the table is NOT readable/writable from
-- the browser with the anon key, which is what we want.
```

3. Storage → create a **private** bucket called `course-files`.
4. Upload the course ZIP there, matching `COURSE_ZIP_PATH` in
   `api/download/verify.js` (defaults to `treats-by-milz-course.zip`).
   Do not make the bucket public — `api/download/verify.js` is the only
   thing that should ever generate a link to it, and only after checking
   `orders.status === 'PAID'`.

## Ozow setup

1. Get `Site Code`, `Private Key` and `API Key` from your Ozow merchant
   admin.
2. Set all the vars in `.env.example` in Vercel (staging URL + test
   keys first).
3. **Before accepting real payments**, open `lib/ozow.js` and
   `api/checkout/webhook.js` and check the field order in the `TODO`
   comments against Ozow's current docs / Postman collection from your
   merchant dashboard. Ozow's HashCheck is strict about field order and
   does update occasionally — this scaffold reflects Ozow's commonly
   published Direct API field order at the time of writing, not a live
   API call, so it needs a real sandbox test before going live.
4. Test the full loop in staging: `checkout.html` → Ozow staging bank
   selection → `success.html` with a real signed download URL.

## Payment lifecycle

```
PENDING → PAYMENT_INITIATED → PAID  (webhook confirms this — never the redirect alone)
                              → FAILED
                              → CANCELLED
```

`success.html` asks `/api/download/verify` for a signed URL, which
re-checks `status === 'PAID'` against Supabase every time — so even if
someone bookmarks or shares a success.html link, it only works if that
specific order is actually paid, and the signed URL itself expires
after 15 minutes.

## Local note

There's no local dev server here on purpose — same workflow as your
other Vercel projects: push straight to GitHub, Vercel builds and
deploys. For the `/api` routes specifically, you'll only be able to
fully test end-to-end once real env vars are set in Vercel (Ozow
staging keys + a real Supabase project), since they call out to both.
