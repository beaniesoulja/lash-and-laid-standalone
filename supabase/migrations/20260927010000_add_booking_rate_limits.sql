create table if not exists public.booking_rate_limits (
  fingerprint text not null,
  window_started_at timestamptz not null,
  attempts integer not null check (attempts > 0),
  expires_at timestamptz not null,
  primary key (fingerprint, window_started_at)
);

create index if not exists booking_rate_limits_expires_at_idx
  on public.booking_rate_limits (expires_at);

alter table public.booking_rate_limits enable row level security;
alter table public.booking_rate_limits force row level security;

revoke all on table public.booking_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on table public.booking_rate_limits to service_role;

create or replace function public.consume_booking_rate_limit(
  p_fingerprint text,
  p_limit integer default 5,
  p_window_seconds integer default 900
)
returns table (allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_window_start timestamptz;
  v_attempts integer;
begin
  if char_length(p_fingerprint) < 32 or p_limit < 1 or p_window_seconds < 60 then
    raise exception 'Invalid rate limit parameters';
  end if;

  v_window_start := to_timestamp(
    floor(extract(epoch from v_now) / p_window_seconds) * p_window_seconds
  );

  insert into public.booking_rate_limits (fingerprint, window_started_at, attempts, expires_at)
  values (
    p_fingerprint,
    v_window_start,
    1,
    v_window_start + make_interval(secs => p_window_seconds * 2)
  )
  on conflict (fingerprint, window_started_at)
  do update set attempts = public.booking_rate_limits.attempts + 1
  returning attempts into v_attempts;

  delete from public.booking_rate_limits
  where expires_at < v_now;

  return query select
    v_attempts <= p_limit,
    case
      when v_attempts <= p_limit then 0
      else greatest(1, ceil(extract(epoch from (v_window_start + make_interval(secs => p_window_seconds) - v_now)))::integer)
    end;
end;
$$;

revoke all on function public.consume_booking_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_booking_rate_limit(text, integer, integer) to service_role;

comment on table public.booking_rate_limits is 'Short-lived booking submission counters keyed by a salted, one-way client fingerprint.';
