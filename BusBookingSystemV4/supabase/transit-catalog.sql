create table if not exists public.transit_meta (
  id smallint primary key default 1 check (id = 1),
  source text not null,
  publisher_url text,
  built_at timestamptz,
  route_count int not null default 0,
  departure_count int not null default 0,
  place_count int not null default 0,
  updated_at timestamptz default now()
);

create table if not exists public.transit_places (
  label text primary key,
  search_keys text[] not null default '{}',
  sort_order int not null default 0
);

create table if not exists public.transit_routes (
  route_id text primary key,
  name text not null,
  short_name text,
  origin_label text not null,
  dest_label text not null,
  origin_display text not null,
  dest_display text not null,
  agency text,
  route_type text,
  is_rail boolean not null default false
);

create table if not exists public.transit_departures (
  id int primary key,
  route_id text not null references public.transit_routes (route_id) on delete cascade,
  trip_id text,
  route_line text not null,
  bus_name text not null,
  origin_label text not null,
  dest_label text not null,
  origin_display text not null,
  dest_display text not null,
  seats_available int not null default 24,
  depart_time text not null,
  arrive_time text not null,
  duration text not null,
  adult_fare numeric(10, 2) not null,
  child_fare numeric(10, 2) not null,
  occupied_seats int[] not null default '{}'
);

create index if not exists transit_departures_route_id_idx
  on public.transit_departures (route_id);

create index if not exists transit_departures_origin_idx
  on public.transit_departures (origin_label);

create index if not exists transit_departures_dest_idx
  on public.transit_departures (dest_label);

-- ---------------------------------------------------------------------------
-- Row Level Security — public read (search without sign-in)
-- ---------------------------------------------------------------------------

alter table public.transit_meta enable row level security;
alter table public.transit_places enable row level security;
alter table public.transit_routes enable row level security;
alter table public.transit_departures enable row level security;

drop policy if exists "transit_meta_public_read" on public.transit_meta;
create policy "transit_meta_public_read"
  on public.transit_meta for select
  to anon, authenticated
  using (true);

drop policy if exists "transit_places_public_read" on public.transit_places;
create policy "transit_places_public_read"
  on public.transit_places for select
  to anon, authenticated
  using (true);

drop policy if exists "transit_routes_public_read" on public.transit_routes;
create policy "transit_routes_public_read"
  on public.transit_routes for select
  to anon, authenticated
  using (true);

drop policy if exists "transit_departures_public_read" on public.transit_departures;
create policy "transit_departures_public_read"
  on public.transit_departures for select
  to anon, authenticated
  using (true);
