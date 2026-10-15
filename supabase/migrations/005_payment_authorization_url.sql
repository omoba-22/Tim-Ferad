-- Remember the Paystack checkout link, so a double-clicked booking button
-- returns the same link instead of starting a second payment.
alter table payments add column authorization_url text;