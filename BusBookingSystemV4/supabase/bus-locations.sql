create table if not exists public.transit_place_coords (
  label text primary key,
  latitude double precision not null,
  longitude double precision not null
);

create table if not exists public.bus_locations (
  departure_id int primary key references public.transit_departures (id) on delete cascade,
  route_id text not null,
  bus_name text not null,
  latitude double precision not null,
  longitude double precision not null,
  heading smallint,
  speed_kph numeric(6, 2) default 25,
  updated_at timestamptz not null default now()
);

create index if not exists bus_locations_route_id_idx on public.bus_locations (route_id);
create index if not exists bus_locations_updated_at_idx on public.bus_locations (updated_at desc);

alter table public.transit_place_coords enable row level security;
alter table public.bus_locations enable row level security;

drop policy if exists "transit_place_coords_public_read" on public.transit_place_coords;
create policy "transit_place_coords_public_read"
  on public.transit_place_coords for select
  to anon, authenticated
  using (true);

drop policy if exists "bus_locations_public_read" on public.bus_locations;
create policy "bus_locations_public_read"
  on public.bus_locations for select
  to anon, authenticated
  using (true);

alter table public.bus_locations replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.bus_locations;
exception
  when duplicate_object then null;
  when others then
    raise notice 'Add bus_locations to supabase_realtime publication in the Dashboard if live updates do not work.';
end;
$$;

-- Stable-ish (kinda idk :3 HAAAIIII)
create or replace function public.bl_frac(dep_id int)
returns double precision
language sql
immutable
as $$
  select ((dep_id % 97)::double precision / 97.0) * 0.7 + 0.15;
$$;

grant execute on function public.bl_frac(int) to anon, authenticated;

create or replace function public.refresh_bus_locations_demo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  o_lat double precision;
  o_lng double precision;
  d_lat double precision;
  d_lng double precision;
  frac double precision;
  step double precision := 0.004;
begin
  for r in
    select bl.departure_id, bl.latitude, bl.longitude, td.origin_label, td.dest_label
    from public.bus_locations bl
    join public.transit_departures td on td.id = bl.departure_id
  loop
    select latitude, longitude into o_lat, o_lng
    from public.transit_place_coords where label = r.origin_label;
    select latitude, longitude into d_lat, d_lng
    from public.transit_place_coords where label = r.dest_label;

    if o_lat is null or d_lat is null then
      continue;
    end if;

    frac := case
      when abs(d_lat - o_lat) >= abs(d_lng - o_lng) and abs(d_lat - o_lat) > 1e-9 then
        (r.latitude - o_lat) / (d_lat - o_lat)
      when abs(d_lng - o_lng) > 1e-9 then
        (r.longitude - o_lng) / (d_lng - o_lng)
      else
        bl_frac(r.departure_id)
    end;

    frac := greatest(0.05, least(0.95, frac + step));

    update public.bus_locations
    set
      latitude = o_lat + (d_lat - o_lat) * frac,
      longitude = o_lng + (d_lng - o_lng) * frac,
      speed_kph = 22 + (r.departure_id % 9) * 2.5,
      updated_at = now()
    where departure_id = r.departure_id;
  end loop;
end;
$$;

grant execute on function public.refresh_bus_locations_demo() to anon, authenticated;
