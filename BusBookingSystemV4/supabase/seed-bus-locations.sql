insert into public.transit_place_coords (label, latitude, longitude) values
  ('Alabang · Muntinlupa south', 14.4186, 121.0437),
  ('Alabang · to Lawton (Manila)', 14.4186, 121.0437),
  ('Antipolo · east of Metro Manila', 14.6255, 121.1225),
  ('Ayala · Makati CBD (MRT-3)', 14.5493, 121.0277),
  ('Baclaran · LRT-1 & Roxas Blvd', 14.5378, 120.9938),
  ('Baclaran · SM Fairview corridor', 14.5378, 120.9938),
  ('Balintawak · Quezon City (LRT-1)', 14.6573, 121.0034),
  ('Cainta · Ortigas East', 14.5784, 121.1081),
  ('Cubao · Araneta City', 14.6195, 121.0563),
  ('Dasmariñas · Cavite', 14.3297, 120.9367),
  ('Dasmariñas · Cavite (south of Manila)', 14.3297, 120.9367),
  ('Fairview · Quezon City north', 14.7057, 121.0628),
  ('Grotto · San Jose del Monte', 14.7896, 121.0589),
  ('Intramuros · Old walled city (near Lawton)', 14.5906, 120.9755),
  ('Lawton · Manila City Hall area', 14.5895, 120.9784),
  ('Lawton · Plaza Lawton (Intramuros nearby)', 14.5895, 120.9784),
  ('Makati · CBD (Ayala / Buendia)', 14.5547, 121.0244),
  ('Malabon · north Manila', 14.6692, 120.9679),
  ('Manila · Ermita / Asturias (near Rizal Park)', 14.5826, 120.9842),
  ('MOA · Mall of Asia (Pasay / Baclaran area)', 14.5352, 120.9817),
  ('Monumento · North EDSA hub', 14.6538, 120.9843),
  ('NAIA · Domestic Terminal', 14.5151, 121.0028),
  ('NAIA · Manila Airport', 14.5086, 121.0198),
  ('Navotas · Manila Bay north', 14.6666, 120.9418),
  ('North Avenue · Cubao (MRT-3)', 14.6538, 121.0494),
  ('Novaliches · Quezon City', 14.7213, 121.0399),
  ('Ortigas · Mandaluyong / Pasig CBD', 14.5846, 121.0563),
  ('Ortigas · Shaw Blvd / EDSA', 14.5743, 121.0531),
  ('Pandacan · Manila south', 14.5931, 121.0093),
  ('Pasay · Roxas Blvd & airport corridor', 14.5374, 120.9992),
  ('Pasay · to SM Fairview', 14.5374, 120.9992),
  ('Quezon City · Cubao & north', 14.6760, 121.0437),
  ('Quiapo · Old Manila & markets', 14.5988, 120.9841),
  ('Recto · LRT-2 (Chinatown / Quiapo)', 14.6035, 120.9812),
  ('Roosevelt · Quezon City (LRT-1 north)', 14.6573, 121.0324),
  ('Santolan · LRT-2 (Greenhills area)', 14.6032, 121.0345),
  ('SM Fairview · Quezon City', 14.7057, 121.0628),
  ('Taft Avenue · MRT-3 & EDSA', 14.5374, 120.9992),
  ('Taguig · BGC / McKinley area', 14.5510, 121.0500),
  ('Taguig · FTI to Monumento', 14.5510, 121.0500),
  ('Alabang', 14.4186, 121.0437),
  ('Antipolo', 14.6255, 121.1225),
  ('Ayala', 14.5493, 121.0277),
  ('Baclaran', 14.5378, 120.9938),
  ('Balintawak', 14.6573, 121.0034),
  ('Cainta', 14.5784, 121.1081),
  ('Cubao', 14.6195, 121.0563),
  ('Fairview', 14.7057, 121.0628),
  ('Lawton', 14.5895, 120.9784),
  ('Makati', 14.5547, 121.0244),
  ('Malabon', 14.6692, 120.9679),
  ('Manila', 14.5826, 120.9842),
  ('Monumento', 14.6538, 120.9843),
  ('Ortigas', 14.5846, 121.0563),
  ('Pasay', 14.5374, 120.9992),
  ('Plaza Lawton', 14.5895, 120.9784),
  ('Quiapo', 14.5988, 120.9841),
  ('Recto', 14.6035, 120.9812),
  ('Roosevelt', 14.6573, 121.0324),
  ('Santolan', 14.6032, 121.0345),
  ('Taft Ave', 14.5374, 120.9992),
  ('North Ave', 14.6538, 121.0494)
on conflict (label) do update set
  latitude = excluded.latitude,
  longitude = excluded.longitude;

truncate table public.bus_locations;

insert into public.bus_locations (
  departure_id,
  route_id,
  bus_name,
  latitude,
  longitude,
  heading,
  speed_kph
)
select
  d.id,
  d.route_id,
  d.bus_name,
  o.latitude + (dest.latitude - o.latitude) * public.bl_frac(d.id),
  o.longitude + (dest.longitude - o.longitude) * public.bl_frac(d.id),
  (45 + (d.id % 8) * 40)::smallint,
  20 + (d.id % 15)
from public.transit_departures d
join public.transit_place_coords o on o.label = d.origin_label
join public.transit_place_coords dest on dest.label = d.dest_label;

-- Fallback for any departure missing place coords (Manila center)
insert into public.bus_locations (
  departure_id,
  route_id,
  bus_name,
  latitude,
  longitude,
  heading,
  speed_kph
)
select
  d.id,
  d.route_id,
  d.bus_name,
  14.5995 + ((d.id % 20) - 10) * 0.002,
  121.0000 + ((d.id % 17) - 8) * 0.002,
  90,
  25
from public.transit_departures d
where not exists (
  select 1 from public.bus_locations bl where bl.departure_id = d.id
);
