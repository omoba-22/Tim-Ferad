-- Tim-Ferad initial schema. Run once on a new database.

-- Keeps updated_at correct automatically
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- STAFF -------------------------------------------------------------
create table staff_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role text not null check (role in ('admin', 'operator')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ROUTES, VEHICLES, TRIPS -------------------------------------------
create table routes (
  id uuid primary key default gen_random_uuid(),
  origin_city text not null,
  destination_city text not null,
  default_departure_point text,            -- pending client confirmation
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origin_city, destination_city),
  check (origin_city <> destination_city)
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  plate_number text unique,
  passenger_capacity integer not null check (passenger_capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  route_id uuid not null references routes(id) on delete restrict,
  vehicle_id uuid not null references vehicles(id) on delete restrict,
  departure_at timestamptz not null,
  -- Copied from the vehicle when the trip is created, so later vehicle
  -- edits never change a trip that already has bookings.
  capacity integer not null check (capacity > 0),
  fare_kobo bigint not null check (fare_kobo > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  departure_point text,
  booking_cutoff_at timestamptz,
  status text not null default 'draft'
    check (status in ('draft', 'published', 'closed', 'cancelled', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle_id, departure_at)
);
create index trips_search_idx on trips (route_id, departure_at) where status = 'published';

-- BOOKINGS ----------------------------------------------------------
create table bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  trip_id uuid not null references trips(id) on delete restrict,
  contact_email text not null,
  contact_phone text not null,
  passenger_count integer not null check (passenger_count > 0),
  unit_fare_kobo bigint not null check (unit_fare_kobo > 0),   -- fare at time of booking
  total_kobo bigint not null,
  status text not null default 'pending_payment'
    check (status in ('pending_payment', 'confirmed', 'expired', 'cancelled')),
  expires_at timestamptz not null,
  access_token_hash text not null,
  idempotency_key text unique,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (total_kobo = unit_fare_kobo * passenger_count)
);
create index bookings_capacity_idx on bookings (trip_id, status, expires_at);

create table booking_passengers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  full_name text not null,
  created_at timestamptz not null default now()
);
create index booking_passengers_booking_idx on booking_passengers (booking_id);

-- PAYMENTS ----------------------------------------------------------
create table payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete restrict,
  paystack_reference text not null unique,
  amount_kobo bigint not null check (amount_kobo > 0),
  currency text not null default 'NGN',
  status text not null default 'pending'
    check (status in ('pending', 'succeeded', 'failed', 'refund_required', 'refunded')),
  exception_reason text
    check (exception_reason in ('late_payment_no_capacity', 'amount_mismatch',
                                'duplicate_payment', 'booking_cancelled')),
  paystack_transaction_id text,
  paid_at timestamptz,
  refund_reference text,     -- filled in by staff after a manual refund
  refund_note text,
  verify_response jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- A booking can have at most ONE successful payment
create unique index payments_one_success_idx on payments (booking_id) where status = 'succeeded';
create index payments_status_idx on payments (status);

-- Every webhook we receive; the unique key blocks duplicate processing
create table payment_events (
  id uuid primary key default gen_random_uuid(),
  event_key text not null unique,
  event_type text,
  reference text,
  payload jsonb,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  result text
);

-- DELIVERY ----------------------------------------------------------
create table delivery_orders (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  -- Placeholder statuses until the company confirms its workflow
  status text not null default 'pending_review'
    check (status in ('pending_review', 'confirmed', 'picked_up', 'in_transit', 'delivered', 'cancelled')),
  sender_name text not null,
  sender_phone text not null,
  sender_email text,
  recipient_name text not null,
  recipient_phone text not null,
  pickup_address text not null,
  delivery_address text not null,
  package_description text not null,
  instructions text,
  charge_kobo bigint check (charge_kobo >= 0),   -- empty until the company confirms a charge
  internal_notes text,
  idempotency_key text unique,
  access_token_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index delivery_orders_status_idx on delivery_orders (status, created_at desc);

-- EMAIL OUTBOX, AUDIT, SETTINGS -------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  recipient_email text not null,
  booking_id uuid references bookings(id) on delete set null,
  delivery_order_id uuid references delivery_orders(id) on delete set null,
  payload jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  dedupe_key text unique,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_queue_idx on notifications (status, next_attempt_at);

create table audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
create index audit_events_entity_idx on audit_events (entity_type, entity_id);

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- AUTO updated_at ---------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['routes', 'vehicles', 'trips', 'bookings',
                           'payments', 'delivery_orders', 'app_settings'] loop
    execute format('create trigger set_updated_at before update on %I
                    for each row execute function set_updated_at()', t);
  end loop;
end $$;

-- SECURITY: lock everything. No public policies exist, so the browser can
-- never read these tables directly. Only the backend (secret key) can.
do $$
declare t text;
begin
  foreach t in array array['staff_profiles', 'routes', 'vehicles', 'trips', 'bookings',
                           'booking_passengers', 'payments', 'payment_events',
                           'delivery_orders', 'notifications', 'audit_events', 'app_settings'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;