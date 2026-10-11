-- Run in the Supabase SQL editor. The bookings table remains private.
-- Replace the dates below with the campaign reporting period you want.
select
  coalesce(campaign_source, '(direct / untagged)') as utm_source,
  coalesce(campaign_medium, '(none)') as utm_medium,
  coalesce(campaign_name, '(none)') as utm_campaign,
  count(*) as saved_requests,
  count(*) filter (where status in ('confirmed', 'completed', 'no_show')) as confirmed_appointments,
  count(*) filter (where status = 'completed') as attended_appointments
from public.bookings
where created_at >= '2026-10-01'::timestamptz
  and created_at < '2026-11-01'::timestamptz
group by 1, 2, 3
order by attended_appointments desc, saved_requests desc;
