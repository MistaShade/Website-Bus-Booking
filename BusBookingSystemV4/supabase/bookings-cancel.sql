alter table public.bookings
  add column if not exists status text not null default 'confirmed';
alter table public.bookings
  add column if not exists cancelled_at timestamptz;
alter table public.bookings
  add column if not exists refunded_at timestamptz;
alter table public.bookings
  add column if not exists refund_amount numeric(10, 2);

drop policy if exists "bookings_update_own" on public.bookings;
create policy "bookings_update_own"
  on public.bookings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
