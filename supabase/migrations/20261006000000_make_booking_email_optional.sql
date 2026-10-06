alter table public.bookings
  drop constraint if exists bookings_email_check;

alter table public.bookings
  alter column email drop not null;

alter table public.bookings
  add constraint bookings_email_check
  check (
    email is null
    or (
      char_length(email) between 5 and 254
      and position('@' in email) > 1
    )
  );

comment on column public.bookings.email is
  'Optional backup contact. WhatsApp remains the primary booking contact.';
