-- Authoritative v1 synchronization protocol. Apply with the Supabase SQL editor.
begin;
create table if not exists public.ap_sync_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  generation bigint not null default 1,
  revision bigint not null default 0
);
create table if not exists public.ap_sync_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('trials','ambient','sessions','blocks','epochs','meta')),
  logical_id text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  device_id uuid not null,
  clock bigint not null,
  revision bigint not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (user_id, kind, logical_id)
);
create index if not exists ap_sync_records_pull on public.ap_sync_records(user_id, revision);
create table if not exists public.ap_sync_deletions (
  user_id uuid not null references auth.users(id) on delete cascade,
  token uuid not null,
  generation bigint not null,
  primary key (user_id, token)
);
alter table public.ap_sync_accounts enable row level security;
alter table public.ap_sync_records enable row level security;
alter table public.ap_sync_deletions enable row level security;
drop policy if exists own_read on public.ap_sync_accounts;
create policy own_read on public.ap_sync_accounts for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists own_read on public.ap_sync_records;
create policy own_read on public.ap_sync_records for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists own_read on public.ap_sync_deletions;
create policy own_read on public.ap_sync_deletions for select to authenticated using (user_id = (select auth.uid()));
revoke all on public.ap_sync_accounts, public.ap_sync_records, public.ap_sync_deletions from public, anon, authenticated;
grant select on public.ap_sync_accounts, public.ap_sync_records, public.ap_sync_deletions to authenticated;

create or replace function public.ap_sync_pull(after_revision bigint default 0, page_size integer default 200)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); account public.ap_sync_accounts; rows jsonb; next_revision bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  insert into public.ap_sync_accounts(user_id) values(uid) on conflict do nothing;
  -- All protocol operations use this same lock; revisions cannot commit out of order.
  select * into account from public.ap_sync_accounts where user_id = uid for update;
  select coalesce(jsonb_agg(to_jsonb(r) order by r.revision), '[]'::jsonb), max(r.revision)
    into rows, next_revision from (
      select kind, logical_id, payload, device_id, clock, revision, created_at
      from public.ap_sync_records where user_id = uid and revision > greatest(after_revision, 0)
      order by revision limit greatest(1, least(page_size, 500))
    ) r;
  return jsonb_build_object('generation', account.generation, 'rows', rows,
    'cursor', coalesce(next_revision, account.revision), 'more', coalesce(next_revision, account.revision) < account.revision);
end $$;

create or replace function public.ap_sync_push(expected_generation bigint, entries jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := auth.uid(); account public.ap_sync_accounts; entry jsonb;
  prior public.ap_sync_records; body jsonb; record_kind text; logical text; device uuid; tick bigint;
  acknowledgements jsonb := '[]'; failures jsonb := '[]'; changed boolean;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 200 then raise exception 'Invalid upload batch'; end if;
  insert into public.ap_sync_accounts(user_id) values(uid) on conflict do nothing;
  select * into account from public.ap_sync_accounts where user_id = uid for update;
  if expected_generation is distinct from account.generation then
    return jsonb_build_object('generation', account.generation, 'reset', true, 'accepted', '[]'::jsonb, 'errors', '[]'::jsonb);
  end if;
  for entry in select value from jsonb_array_elements(entries) loop
    begin
      record_kind := entry->>'kind'; logical := entry->>'logical_id'; body := entry->'payload';
      device := (entry->>'device_id')::uuid; tick := (entry->>'clock')::bigint;
      if record_kind is null or logical is null or device is null or tick is null or tick < 0 or tick > 9007199254740991 or jsonb_typeof(body) is distinct from 'object' then raise exception 'Invalid record envelope'; end if;
      if record_kind = 'meta' then
        if logical not in ('curriculumEpoch','candidateOverride','level','streak','lastTrialTime','responseWindowMs','adaptiveMode','notExactMode','noiseScrambleMode')
          or body->>'key' is distinct from logical or not (body ? 'value') then raise exception 'Invalid user state'; end if;
      else
        perform logical::uuid;
        if body->>'id' is distinct from logical then raise exception 'Record identity mismatch'; end if;
      end if;
      select * into prior from public.ap_sync_records where user_id = uid and ap_sync_records.kind = record_kind and logical_id = logical;
      changed := not found;
      if not changed and record_kind = 'sessions' then
        if body->>'ended_at' is not null then
          body := prior.payload || jsonb_build_object('ended_at', greatest(prior.payload->>'ended_at', body->>'ended_at'));
          changed := body is distinct from prior.payload;
        end if;
      elsif not changed and record_kind = 'meta' then
        if logical = 'lastTrialTime' then body := jsonb_set(body, '{value}', to_jsonb(greatest((body->>'value')::numeric, (prior.payload->>'value')::numeric))); end if;
        changed := (tick, device::text) > (prior.clock, prior.device_id::text);
        if logical = 'curriculumEpoch' and body->>'initial' = 'true' then changed := false; end if;
      end if;
      if changed then
        account.revision := account.revision + 1;
        insert into public.ap_sync_records(user_id, kind, logical_id, payload, device_id, clock, revision)
          values(uid, record_kind, logical, body, device, tick, account.revision)
          on conflict (user_id, kind, logical_id) do update set payload = excluded.payload,
            device_id = excluded.device_id, clock = excluded.clock, revision = excluded.revision;
      end if;
      acknowledgements := acknowledgements || jsonb_build_array(entry->>'token');
    exception when others then
      -- A rejected historical row does not block later valid observations.
      failures := failures || jsonb_build_array(jsonb_build_object('token', entry->>'token', 'message', sqlerrm));
    end;
  end loop;
  update public.ap_sync_accounts set revision = account.revision where user_id = uid;
  return jsonb_build_object('generation', account.generation, 'accepted', acknowledgements, 'errors', failures);
end $$;

create or replace function public.ap_sync_delete_history(request_token uuid)
returns bigint language plpgsql security definer set search_path = '' as $$
declare uid uuid := auth.uid(); next_generation bigint; prior_generation bigint;
begin
  if uid is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if request_token is null then raise exception 'Deletion token required'; end if;
  insert into public.ap_sync_accounts(user_id) values(uid) on conflict do nothing;
  perform 1 from public.ap_sync_accounts where user_id = uid for update;
  select generation into prior_generation from public.ap_sync_deletions where user_id = uid and token = request_token;
  if found then return prior_generation; end if;
  update public.ap_sync_accounts set generation = generation + 1 where user_id = uid returning generation into next_generation;
  delete from public.ap_sync_records where user_id = uid;
  insert into public.ap_sync_deletions values(uid, request_token, next_generation);
  return next_generation;
end $$;

revoke all on function public.ap_sync_pull(bigint, integer), public.ap_sync_push(bigint, jsonb), public.ap_sync_delete_history(uuid) from public, anon;
grant execute on function public.ap_sync_pull(bigint, integer), public.ap_sync_push(bigint, jsonb), public.ap_sync_delete_history(uuid) to authenticated;

-- Earlier scaffolding is not a second writable API. Preserve any stored rows
-- for deliberate migration; never silently drop them or expose them publicly.
do $$ declare tab text; begin
  foreach tab in array array['trials','ambient','sessions','blocks','epochs','user_state'] loop
    if to_regclass('public.' || tab) is not null then
      execute format('revoke all on public.%I from anon, authenticated', tab);
    end if;
  end loop;
end $$;
commit;
