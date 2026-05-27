create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  deactivated_at timestamptz,
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (auth.uid() = id);

-- Auto-create profile when a user signs up
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2) Link bookings to the logged-in user (required for per-account My Trips + RLS)
alter table public.bookings
  add column if not exists user_id uuid references auth.users (id);

alter table public.bookings
  add column if not exists created_at timestamptz default now();

create index if not exists bookings_user_id_idx on public.bookings (user_id);

alter table public.bookings enable row level security;

-- Drop broad anon policies if you added them earlier (names may differ — adjust in Dashboard if needed)
-- Example: drop policy if exists "Allow anon insert" on public.bookings;

-- Signed-in users: only their rows
drop policy if exists "bookings_select_own" on public.bookings;
create policy "bookings_select_own"
  on public.bookings for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "bookings_insert_own" on public.bookings;
create policy "bookings_insert_own"
  on public.bookings for insert
  to authenticated
  with check (user_id = auth.uid());

-- Block anonymous access to bookings (each account only sees its own rows above)
drop policy if exists "bookings_anon_select" on public.bookings;
drop policy if exists "bookings_anon_insert" on public.bookings;
drop policy if exists "bookings_anon_update" on public.bookings;
drop policy if exists "bookings_anon_delete" on public.bookings;

drop policy if exists "bookings_update_own" on public.bookings;
create policy "bookings_update_own"
  on public.bookings for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Cancellation columns (also in bookings-cancel.sql for existing projects)
alter table public.bookings
  add column if not exists status text not null default 'confirmed';

alter table public.bookings
  add column if not exists cancelled_at timestamptz;

alter table public.bookings
  add column if not exists refunded_at timestamptz;

alter table public.bookings
  add column if not exists refund_amount numeric(10, 2);

-- 3) Email confirmation: Dashboard → Authentication → Providers → Email
--    For class demos you can disable "Confirm email" so sign-up logs in immediately.
