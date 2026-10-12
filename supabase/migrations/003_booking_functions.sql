-- Seat reservation logic. Runs inside the database so concurrent bookings
-- are handled safely.

-- Passengers currently holding places on a trip: confirmed bookings plus
-- pending bookings whose payment window has not expired yet.
create or replace function trip_held_places(p_trip_id uuid) returns integer
language sql stable set search_path = public as $$
  select coalesce(sum(passenger_count), 0)::integer
  from bookings
  where trip_id = p_trip_id
    and (status = 'confirmed' or (status = 'pending_payment' and expires_at > now()))
$$;

-- Bookable trips for a route on a date (Lagos calendar date), with places left.
create or replace function list_available_trips(p_route_id uuid, p_date date)
returns table (
  trip_id uuid, origin_city text, destination_city text, departure_at timestamptz,
  fare_kobo bigint, currency text, departure_point text, remaining_places integer
)
language sql stable set search_path = public as $$
  select t.id, r.origin_city, r.destination_city, t.departure_at, t.fare_kobo, t.currency,
         coalesce(t.departure_point, r.default_departure_point),
         greatest(t.capacity - trip_held_places(t.id), 0)
  from trips t
  join routes r on r.id = t.route_id
  where t.status = 'published'
    and r.is_active
    and t.route_id = p_route_id
    and (t.departure_at at time zone 'Africa/Lagos')::date = p_date
    and coalesce(
          t.booking_cutoff_at,
          t.departure_at - make_interval(mins => coalesce(
            (select (value #>> '{}')::int from app_settings where key = 'booking_cutoff_minutes'), 0))
        ) > now()
  order by t.departure_at
$$;

-- Creates a pending booking and reserves places in ONE transaction.
-- The fare comes from the trips table, never from the caller.
create or replace function create_booking(
  p_trip_id uuid,
  p_passenger_names text[],
  p_contact_email text,
  p_contact_phone text,
  p_reference text,
  p_access_token_hash text,
  p_paystack_reference text,
  p_idempotency_key text default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_trip trips%rowtype;
  v_booking bookings%rowtype;
  v_count integer := coalesce(array_length(p_passenger_names, 1), 0);
  v_hold_minutes integer;
  v_cutoff_minutes integer;
begin
  if v_count < 1 then raise exception 'invalid_passenger_count'; end if;
  if exists (select 1 from unnest(p_passenger_names) n where btrim(coalesce(n, '')) = '') then
    raise exception 'invalid_passenger_name';
  end if;

  -- LOCK the trip row. Anyone else booking this trip waits here until we
  -- commit, so the capacity check below can never be stale.
  select * into v_trip from trips where id = p_trip_id for update;
  if not found then raise exception 'trip_not_found'; end if;

  -- Same idempotency key twice (double click, retry) returns the first booking.
  if p_idempotency_key is not null then
    select * into v_booking from bookings where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'booking_id', v_booking.id, 'reference', v_booking.reference,
        'total_kobo', v_booking.total_kobo, 'expires_at', v_booking.expires_at,
        'paystack_reference', (select paystack_reference from payments where booking_id = v_booking.id limit 1),
        'already_existed', true);
    end if;
  end if;

  if v_trip.status <> 'published' then raise exception 'trip_not_bookable'; end if;

  select coalesce((select (value #>> '{}')::int from app_settings where key = 'booking_cutoff_minutes'), 0)
    into v_cutoff_minutes;
  if coalesce(v_trip.booking_cutoff_at, v_trip.departure_at - make_interval(mins => v_cutoff_minutes)) <= now() then
    raise exception 'booking_closed';
  end if;

  if trip_held_places(p_trip_id) + v_count > v_trip.capacity then
    raise exception 'not_enough_places';
  end if;

  select coalesce((select (value #>> '{}')::int from app_settings where key = 'reservation_hold_minutes'), 15)
    into v_hold_minutes;

  insert into bookings (reference, trip_id, contact_email, contact_phone, passenger_count,
                        unit_fare_kobo, total_kobo, expires_at, access_token_hash, idempotency_key)
  values (p_reference, p_trip_id, p_contact_email, p_contact_phone, v_count,
          v_trip.fare_kobo, v_trip.fare_kobo * v_count,
          now() + make_interval(mins => v_hold_minutes), p_access_token_hash, p_idempotency_key)
  returning * into v_booking;

  insert into booking_passengers (booking_id, full_name)
  select v_booking.id, btrim(n) from unnest(p_passenger_names) as n;

  insert into payments (booking_id, paystack_reference, amount_kobo, currency)
  values (v_booking.id, p_paystack_reference, v_booking.total_kobo, v_trip.currency);

  return jsonb_build_object(
    'booking_id', v_booking.id, 'reference', v_booking.reference,
    'total_kobo', v_booking.total_kobo, 'expires_at', v_booking.expires_at,
    'paystack_reference', p_paystack_reference, 'already_existed', false);
end $$;

-- SAFETY NET: even if some future code path forgets the check above,
-- the database itself refuses to oversell a trip.
create or replace function enforce_trip_capacity() returns trigger
language plpgsql set search_path = public as $$
declare
  v_capacity integer;
  v_held integer;
begin
  if new.status = 'confirmed' or (new.status = 'pending_payment' and new.expires_at > now()) then
    select capacity into v_capacity from trips where id = new.trip_id for update;
    select coalesce(sum(passenger_count), 0) into v_held
    from bookings
    where trip_id = new.trip_id and id <> new.id
      and (status = 'confirmed' or (status = 'pending_payment' and expires_at > now()));
    if v_held + new.passenger_count > v_capacity then
      raise exception 'not_enough_places';
    end if;
  end if;
  return new;
end $$;

create trigger bookings_capacity_guard
  before insert or update of status, passenger_count, expires_at, trip_id on bookings
  for each row execute function enforce_trip_capacity();

-- Stops staff changes that would break existing bookings.
create or replace function protect_booked_trip() returns trigger
language plpgsql set search_path = public as $$
declare v_held integer;
begin
  v_held := trip_held_places(new.id);
  if new.capacity < v_held then raise exception 'capacity_below_booked'; end if;
  if new.vehicle_id <> old.vehicle_id and v_held > 0 then raise exception 'vehicle_change_blocked'; end if;
  return new;
end $$;

create trigger trips_protect_booked
  before update of capacity, vehicle_id on trips
  for each row execute function protect_booked_trip();

-- Only the backend (service role) may call these functions.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;