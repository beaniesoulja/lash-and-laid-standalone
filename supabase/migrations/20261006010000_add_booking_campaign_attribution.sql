alter table public.bookings
  add column if not exists campaign_source text check (char_length(campaign_source) <= 120),
  add column if not exists campaign_medium text check (char_length(campaign_medium) <= 120),
  add column if not exists campaign_name text check (char_length(campaign_name) <= 120),
  add column if not exists campaign_content text check (char_length(campaign_content) <= 120),
  add column if not exists campaign_term text check (char_length(campaign_term) <= 120);

create index if not exists bookings_campaign_reporting_idx
  on public.bookings (campaign_source, campaign_medium, campaign_name, created_at desc);

comment on column public.bookings.campaign_source is 'UTM source captured from the booking visitor session; client-supplied and not proof of ad delivery.';
comment on column public.bookings.campaign_name is 'UTM campaign label used to group bookings with ad spend.';
