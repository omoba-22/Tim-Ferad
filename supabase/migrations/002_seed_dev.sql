-- Development starter data. Run once. Everything here is a PLACEHOLDER
-- until the client confirms it. No trips are created, because departure
-- times and fares are not confirmed.

insert into routes (origin_city, destination_city) values
  ('Lagos', 'Ibadan'),
  ('Ibadan', 'Lagos');

insert into vehicles (label, passenger_capacity) values
  ('Sienna 1 (placeholder)', 7);

insert into app_settings (key, value) values
  ('reservation_hold_minutes', '15'),   -- engineering default, client to approve
  ('booking_cutoff_minutes', '60');     -- placeholder, pending client