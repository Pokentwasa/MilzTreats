# Treats by Milz

A single-page site selling one digital product — a downloadable baking
course — with PayFast as the payment provider and Supabase handling orders
and secure file delivery.

## What's here

```
index.html              Main site (all 12 sections)
checkout.html           Starts an order + redirects to PayFast
success.html            Post-payment "you're in" screen + secure download
error.html              Payment failed/cancelled screen

css/style.css            All styles
js/site-config.js        Edit course name, price, modules, socials here
js/main.js                Nav, accordion/card rendering, scroll reveals, magnetic buttons

api/checkout/initiate.js  Creates a PENDING order, builds a signed PayFast payment URL
api/checkout/webhook.js   PayFast's server-to-server confirmation (ITN) — source of truth
api/download/verify.js    Issues a short-lived signed download URL, only if PAID

lib/payfast.js              PayFast signing, ITN verification + validate-endpoint helper
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

**`checkout.html`** shows a short "about you" form (what brings you to
the course, which province/country) before starting the PayFast order —
run the schema migration in the Supabase setup section below before
this goes live, or every checkout will 500 on the missing columns. The
dropdown options are hardcoded in both `checkout.html` and
`api/checkout/initiate.js` (`GOAL_OPTIONS`/`PROVINCE_OPTIONS`) — the
server re-validates against the same list, so if you add/rename an
option, update both files together.

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
  provider_transaction_id text, -- PayFast's pf_payment_id, set once the ITN arrives
  customer_goal text, -- checkout.html "about you" form — see api/checkout/initiate.js GOAL_OPTIONS
  customer_goal_other text, -- only set when customer_goal = 'Other'
  province text, -- see api/checkout/initiate.js PROVINCE_OPTIONS
  country text, -- only set when province = 'Outside South Africa'
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

alter table orders enable row level security;
-- No policies added on purpose: the API routes use the service role key,
-- which bypasses RLS. This means the table is NOT readable/writable from
-- the browser with the anon key, which is what we want.

-- RLS bypass and table grants are separate things — service_role still
-- needs explicit privileges on this table, or every query 500s with
-- "permission denied for table orders" (Postgres error 42501).
grant select, insert, update on public.orders to service_role;
```

If you already created this table for the previous Ozow integration, migrate
it instead of dropping it:

```sql
alter table orders rename column ozow_transaction_id to provider_transaction_id;
alter table orders drop column if exists ozow_payment_request_id;
grant select, insert, update on public.orders to service_role;
```

If your `orders` table already existed before the checkout "about you" form
was added, run this once to add the new columns instead of recreating the
table:

```sql
alter table orders add column if not exists customer_goal text;
alter table orders add column if not exists customer_goal_other text;
alter table orders add column if not exists province text;
alter table orders add column if not exists country text;
```

3. Storage → create a **private** bucket called `course-files`.
4. Upload the course ZIP there, matching `COURSE_ZIP_PATH` in
   `api/download/verify.js` (currently `Get started with me_2026.zip`).
   Do not make the bucket public — `api/download/verify.js` is the only
   thing that should ever generate a link to it, and only after checking
   `orders.status === 'PAID'`.

## PayFast setup

1. Get your `Merchant ID` and `Merchant Key` from your PayFast merchant
   dashboard, and set a **Passphrase** under Settings → Integration —
   this integration requires one; without it, the ITN signature can be
   reproduced by anyone who's seen a single real notification.
2. Set all the vars in `.env.example` in Vercel — never paste real
   credentials into a chat, commit, or anywhere outside Vercel's
   Environment Variables screen. Use PayFast's sandbox credentials
   (from their docs) and `PAYFAST_SANDBOX=true` first.
3. **Before accepting real payments**, open `lib/payfast.js` and
   `api/checkout/webhook.js` and check the field order/names in the
   `TODO` comments against PayFast's current Custom Integration and ITN
   docs. This scaffold reflects PayFast's commonly published field order
   at the time of writing, not a live API call, so it needs a real
   sandbox test before going live.
4. Test the full loop in sandbox: `checkout.html` → PayFast sandbox
   payment page → `success.html` with a real signed download URL. Also
   trigger a cancellation to confirm `error.html` behaves — PayFast only
   exposes a single `cancel_url` (no separate failure redirect), so both
   a cancelled and a failed payment land there; the ITN-driven `status`
   in Supabase is the accurate source of truth either way.

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
fully test end-to-end once real env vars are set in Vercel (PayFast
sandbox keys + a real Supabase project), since they call out to both.
