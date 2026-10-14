-- Creates ONE test trip 30 days from today at 10:00 Lagos time. The fare is a
-- fake test number, not a real Tim-Ferad fare. Safe to run again: it replaces
-- the old test trip (only if that trip has no bookings).
delete from trips where departure_point like 'TEST%'
  and not exists (select 1 from bookings b where b.trip_id = trips.id);

insert into trips (route_id, vehicle_id, departure_at, capacity, fare_kobo, departure_point, status)
select r.id, v.id,
       ((date_trunc('day', now() at time zone 'Africa/Lagos') + interval '30 days 10 hours') at time zone 'Africa/Lagos'),
       v.passenger_capacity,
       100000,                              -- TEST fare: NGN 1,000
       'TEST PARK (placeholder)',
       'published'
from routes r, vehicles v
where r.origin_city = 'Lagos' and r.destination_city = 'Ibadan'
  and v.label like 'Sienna 1%'
limit 1;