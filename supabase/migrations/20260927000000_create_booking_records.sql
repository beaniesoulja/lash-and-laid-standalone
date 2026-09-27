create sequence if not exists public.booking_reference_seq start with 1000 increment by 1;

create or replace function public.next_booking_reference()
returns text
language sql
volatile
set search_path = ''
as $$
  select 'LL-'
    || to_char(timezone('Africa/Cairo', now()), 'YYMMDD')
    || '-'
    || lpad(nextval('public.booking_reference_seq')::text, 4, '0');
$$;

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique default public.next_booking_reference(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null check (source in ('shopify', 'standalone')),
  full_name text not null check (char_length(full_name) between 2 and 120),
  whatsapp_number text not null check (char_length(whatsapp_number) between 5 and 40),
  email text not null check (char_length(email) between 5 and 254 and position('@' in email) > 1),
  service text not null check (char_length(service) between 2 and 120),
  preferred_date date not null,
  status text not null default 'new' check (status in ('new', 'whatsapp_opened', 'contacted', 'confirmed', 'completed', 'cancelled', 'no_show')),
  photo_count smallint not null default 0 check (photo_count between 0 and 3),
  whatsapp_opened_at timestamptz,
  contacted_at timestamptz,
  confirmed_starts_at timestamptz,
  completed_at timestamptz,
  staff_notes text,
  consent_at timestamptz not null default now(),
  privacy_notice_version text not null default '2026-09-27'
);

create table if not exists public.booking_photos (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  storage_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 255),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now(),
  unique (booking_id, position)
);

create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists bookings_preferred_date_idx on public.bookings (preferred_date);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_whatsapp_number_idx on public.bookings (whatsapp_number);
create index if not exists booking_photos_booking_id_idx on public.booking_photos (booking_id);

create or replace function public.set_booking_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_bookings_updated_at on public.bookings;
create trigger set_bookings_updated_at
before update on public.bookings
for each row execute function public.set_booking_updated_at();

alter table public.bookings enable row level security;
alter table public.booking_photos enable row level security;
alter table public.bookings force row level security;
alter table public.booking_photos force row level security;

revoke all on table public.bookings from anon, authenticated;
revoke all on table public.booking_photos from anon, authenticated;
revoke all on sequence public.booking_reference_seq from anon, authenticated;
revoke all on function public.next_booking_reference() from public, anon, authenticated;
revoke all on function public.set_booking_updated_at() from public, anon, authenticated;

grant select, insert, update, delete on table public.bookings to service_role;
grant select, insert, update, delete on table public.booking_photos to service_role;
grant usage, select on sequence public.booking_reference_seq to service_role;
grant execute on function public.next_booking_reference() to service_role;
grant execute on function public.set_booking_updated_at() to service_role;

comment on table public.bookings is 'Private Lash & Laid appointment requests received from Shopify and the standalone website.';
comment on table public.booking_photos is 'Private metadata for up to three inspiration photos attached to a booking request.';
comment on column public.bookings.preferred_date is 'The customer requested date. It is not a confirmed appointment.';
comment on column public.bookings.confirmed_starts_at is 'The mutually agreed appointment date and time, set manually by staff.';
