# Accounts & independent My Trips

Register uses `signUp({ email, password, options: { data: { full_name } } })`.  
Login uses `signInWithPassword({ email, password })`.

## Why trips stay separate per account

1. Every insert sets `bookings.user_id` to the **logged-in user’s id** (UUID).
2. **Row Level Security** only allows:
  - `SELECT` where `user_id = auth.uid()`
  - `INSERT` where `user_id = auth.uid()`
3. **My Trips** loads with `.eq("user_id", session.user.id)` only.

User A cannot see User B’s rows in the app or via the anon API key if RLS is enabled.

## One-time SQL (run in order)

1. `bookings-table.sql`
2. `schema.sql` (profiles + trigger + RLS)
3. `bookings-cancel.sql` (cancellation columns + `bookings_update_own` policy for refunds)

In **Authentication → Providers → Email**, turn **off** “Confirm email” for instant sign-up during development.

If login shows “Signing in…” forever, also check:

1. Site URL is `http://127.0.0.1:5500/login.html` (not `file://`).
2. **Settings → API** — if login still fails, copy the **legacy anon** key (starts with `eyJ`) into `supabaseClient.js` as `cfg.key` instead of the publishable key.
3. Browser allows requests to `*.supabase.co` (disable ad-block on localhost for testing).

## Quick test

1. Register **[cody@test.com](mailto:alice@test.com)** → book a trip → **Send & Save Trip**
2. Log out → register **[cody@test.com](mailto:bob@test.com)** → book a different trip
3. **My Trips** as Bob → only Bob’s trip
4. Log in as Alice → **My Trips** → only Alice’s trip

In Supabase **Table Editor → bookings**, each row’s `user_id` should match the correct user under **Authentication → Users**.

## Cancel & refund (My Trips)

- **Cancel reservation** is disabled until **24 hours after booking** (`created_at`), with a visible wait message.
- User must enter the **same email** as their account or receipt email in the confirmation popup.
- On confirm, the booking is set to `status = refunded` with `refund_amount` = `total_price` (demo — no real payment gateway).
- Trips only in localStorage (not synced) cannot be cancelled from the app until saved to Supabase.

