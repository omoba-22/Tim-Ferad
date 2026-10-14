-- Payment confirmation logic. Called by the backend ONLY after it has
-- verified the transaction with Paystack itself.

create or replace function confirm_payment(
  p_paystack_reference text,
  p_amount_kobo bigint,
  p_currency text,
  p_transaction_id text default null,
  p_paid_at timestamptz default null,
  p_verify_response jsonb default null
) returns jsonb
language plpgsql set search_path = public as $$
declare
  v_booking_id uuid;
  v_trip_id uuid;
  v_trip trips%rowtype;
  v_booking bookings%rowtype;
  v_payment payments%rowtype;
  v_held integer;
  v_outcome text;
  v_reason text;
  v_late boolean := false;
  v_company_email text;
begin
  select booking_id into v_booking_id from payments where paystack_reference = p_paystack_reference;
  if not found then
    return jsonb_build_object('outcome', 'unknown_reference');
  end if;

  select trip_id into v_trip_id from bookings where id = v_booking_id;

  -- Lock order is always: trip, then booking, then payment. Keeping one
  -- order everywhere prevents deadlocks. States are read AFTER locking, so
  -- a duplicate call waits here and then sees the finished result.
  select * into v_trip from trips where id = v_trip_id for update;
  select * into v_booking from bookings where id = v_booking_id for update;
  select * into v_payment from payments where paystack_reference = p_paystack_reference for update;

  if v_payment.status in ('succeeded', 'refund_required', 'refunded') then
    v_outcome := 'already_processed';

  elsif p_amount_kobo is distinct from v_payment.amount_kobo
     or p_currency is distinct from v_payment.currency then
    v_outcome := 'exception';
    v_reason := 'amount_mismatch';

  elsif v_booking.status = 'confirmed' then
    -- A different payment already confirmed this booking.
    v_outcome := 'exception';
    v_reason := 'duplicate_payment';

  elsif v_booking.status = 'cancelled' or v_trip.status in ('cancelled', 'completed') then
    v_outcome := 'exception';
    v_reason := 'booking_cancelled';

  elsif v_booking.status = 'pending_payment' and v_booking.expires_at > now() then
    -- The normal case: paid inside the window, places are still reserved.
    v_outcome := 'confirmed';

  else
    -- Late payment: the hold has expired. Restore the booking only if the
    -- places are still free and the trip is still open and in the future.
    select coalesce(sum(passenger_count), 0) into v_held
    from bookings
    where trip_id = v_trip.id and id <> v_booking.id
      and (status = 'confirmed' or (status = 'pending_payment' and expires_at > now()));

    if v_trip.status = 'published' and v_trip.departure_at > now()
       and v_held + v_booking.passenger_count <= v_trip.capacity then
      v_outcome := 'confirmed';
      v_late := true;
    else
      v_outcome := 'exception';
      v_reason := 'late_payment_no_capacity';
    end if;
  end if;

  if v_outcome = 'confirmed' then
    update bookings set status = 'confirmed', confirmed_at = now() where id = v_booking.id;

    update payments set
      status = 'succeeded',
      exception_reason = null,
      paid_at = coalesce(p_paid_at, now()),
      paystack_transaction_id = p_transaction_id,
      verify_response = p_verify_response
    where id = v_payment.id;

    -- Queue emails in the SAME transaction, so a confirmed booking can never
    -- lose its ticket email. The unique dedupe_key blocks duplicates.
    insert into notifications (type, recipient_email, booking_id, dedupe_key)
    values ('ticket', v_booking.contact_email, v_booking.id, 'ticket:' || v_booking.id)
    on conflict (dedupe_key) do nothing;

    select value #>> '{}' into v_company_email
    from app_settings where key = 'company_notification_email';
    if v_company_email is not null and v_company_email <> '' then
      insert into notifications (type, recipient_email, booking_id, dedupe_key)
      values ('booking_company', v_company_email, v_booking.id, 'booking_company:' || v_booking.id)
      on conflict (dedupe_key) do nothing;
    end if;

  elsif v_outcome = 'exception' then
    -- Money arrived but we cannot honour it. Flag it for staff to refund.
    update payments set
      status = 'refund_required',
      exception_reason = v_reason,
      paid_at = coalesce(p_paid_at, now()),
      paystack_transaction_id = p_transaction_id,
      verify_response = p_verify_response
    where id = v_payment.id;
  end if;

  return jsonb_build_object(
    'outcome', v_outcome,
    'reason', v_reason,
    'late', v_late,
    'booking_id', v_booking.id,
    'booking_reference', v_booking.reference,
    'booking_status', (select status from bookings where id = v_booking.id),
    'payment_status', (select status from payments where id = v_payment.id)
  );
end $$;

-- Paystack says the payment failed.
create or replace function mark_payment_failed(
  p_paystack_reference text, p_verify_response jsonb default null
) returns void
language sql set search_path = public as $$
  update payments
  set status = 'failed', verify_response = coalesce(p_verify_response, verify_response)
  where paystack_reference = p_paystack_reference and status = 'pending'
$$;

-- Frees the places immediately, e.g. if we could not start the Paystack payment.
create or replace function release_booking(p_booking_id uuid, p_reason text) returns void
language plpgsql set search_path = public as $$
begin
  update bookings
  set status = 'cancelled', cancelled_at = now(), cancellation_reason = p_reason
  where id = p_booking_id and status = 'pending_payment';

  update payments set status = 'failed'
  where booking_id = p_booking_id and status = 'pending';
end $$;

-- Marks unpaid bookings past their deadline as expired. Capacity never
-- depends on this running, because expired holds are ignored when counting.
create or replace function expire_stale_bookings() returns integer
language plpgsql set search_path = public as $$
declare n integer;
begin
  update bookings set status = 'expired'
  where status = 'pending_payment' and expires_at <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- Only the backend may call these.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to service_role;