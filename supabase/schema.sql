-- ============================================================================
-- AP Trainer — Supabase schema for optional cross-device sync
-- ============================================================================
--
-- This file defines the cloud-side storage for authenticated users who opt
-- into cross-device sync. Anonymous users are completely unaffected by this
-- schema — they keep working entirely against the browser's local IndexedDB
-- store, and nothing here is required for the app to function locally.
--
-- Safe to re-run: every statement is written to be idempotent (`if not
-- exists` / `drop policy if exists` + `create policy`), so re-running this
-- file after a partial failure — or against a project that already has some
-- of these objects — will not error out.
--
-- Run this once, in full, against a fresh Supabase project via the SQL
-- editor (or `supabase db push` if you're using the CLI). It creates no
-- project, references no real project URL/key, and does not touch anything
-- outside the `public` schema.
--
-- ----------------------------------------------------------------------------
-- Design notes (read before modifying)
-- ----------------------------------------------------------------------------
--
-- 1. JSONB `payload` instead of normalized columns.
--    Each record table stores the entire client-side record as an opaque
--    JSON blob in `payload`, rather than one SQL column per field. The
--    client's trial/session/etc. schemas are still evolving; normalizing
--    now would mean a DB migration every time a new field is added to a
--    trial or a session. `payload jsonb` lets the client's shape change
--    freely. This can be normalized later once the shape stabilizes — this
--    file deliberately does not try to anticipate that.
--
-- 2. Client-generated `id`, no `gen_random_uuid()` default.
--    Records are created locally first (IndexedDB, offline-capable) and
--    synced up later, so the client always generates the id itself via
--    `crypto.randomUUID()` before the row is ever sent to Supabase. If `id`
--    had a server-side default, the client's local id (the one IndexedDB
--    already indexed the record under) and the server's id could diverge,
--    breaking sync/dedup. So `id` has no default here — every insert must
--    supply it explicitly.
--
-- 3. `USING` vs `WITH CHECK` in RLS policies.
--    `USING` filters which *existing* rows a statement can see/target.
--    `WITH CHECK` validates *new or modified* row data before it's written.
--    For INSERT, Postgres only accepts `WITH CHECK` — there is no existing
--    row for `USING` to filter, so `create policy ... for insert using (...)`
--    is rejected outright at DDL time (a parse-time error, not a silently
--    permissive policy). Every INSERT policy below uses
--    `WITH CHECK (auth.uid() = user_id)` to enforce that a user can only
--    ever insert rows stamped with their own user_id.
--    The clause combination that's actually easy to get wrong is UPDATE
--    with `USING` but no `WITH CHECK`: Postgres silently allows that (it
--    just reuses `USING` as the check), and it would let a user take a row
--    they own and reassign its `user_id` to someone else, since nothing
--    validates the *new* row. Every UPDATE policy below therefore states
--    both clauses explicitly: `USING` restricts which existing rows can be
--    targeted at all (must already be mine), and `WITH CHECK` restricts
--    what the row can be changed *to* (must still be mine afterward).
--
-- 4. Append-only is a client-side convention, not a DB-enforced rule.
--    The product spec treats trials/ambient/blocks/epochs as immutable and
--    sessions as append-mostly (only `ended_at`-style fields get updated).
--    That's how the *app* behaves, not a guarantee the *database* makes in
--    this first version. We deliberately do not add triggers or column
--    privileges to block UPDATE/DELETE here. The RLS policies below are the
--    actual security boundary: they guarantee a user can only ever touch
--    their own rows, however they touch them. Conflating "the app doesn't
--    do X" with "the DB forbids X" would be a mistake — if a legitimate
--    need to correct/delete a user's own row shows up later (bug fix,
--    account tooling, etc.), it shouldn't require a schema migration just
--    to lift a trigger.
--
-- 5. No extra `(user_id, id)` uniqueness constraint.
--    The sync dedup key is the record's own `id`, which is already globally
--    unique by construction (`crypto.randomUUID()`), not merely unique
--    per-user. `id` is already the primary key, which already enforces
--    global uniqueness on its own — a `unique (user_id, id)` constraint
--    would be strictly weaker than (implied by) the existing primary key,
--    so it would add nothing. It's omitted on purpose, not by oversight.
--
-- ============================================================================


-- ============================================================================
-- Record tables: trials, ambient, sessions, blocks, epochs
-- ============================================================================
-- All five share the same shape: id / user_id / created_at / payload.
-- See design note 1 above for why the payload isn't normalized, and note 2
-- for why `id` has no server-side default.

create table if not exists public.trials (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.ambient (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.blocks (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

create table if not exists public.epochs (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  payload jsonb not null
);

-- `references auth.users(id) on delete cascade`: if a user's auth account is
-- deleted, their synced rows are cleaned up automatically rather than being
-- left behind as orphaned rows with a dangling user_id. This doesn't affect
-- anonymous/local usage at all since those rows never reach this table.

-- Indexes for the common "give me my rows since date X" access pattern.
-- (`id` is already uniquely indexed via the primary key — see design note 5
-- for why no further uniqueness constraint is added.)
create index if not exists trials_user_id_created_at_idx   on public.trials   (user_id, created_at);
create index if not exists ambient_user_id_created_at_idx  on public.ambient  (user_id, created_at);
create index if not exists sessions_user_id_created_at_idx on public.sessions (user_id, created_at);
create index if not exists blocks_user_id_created_at_idx   on public.blocks   (user_id, created_at);
create index if not exists epochs_user_id_created_at_idx   on public.epochs  (user_id, created_at);


-- ============================================================================
-- user_state: small account-level singleton state per user
-- ============================================================================
-- Holds things like which epoch a user is currently training against, so
-- desktop and phone sessions converge on the same "active" epoch instead of
-- each independently spinning up its own. Modeled as one row per user, with
-- `user_id` itself as the primary key (rather than a separate `id` plus a
-- unique constraint on `user_id`) — this is the simplest way to guarantee a
-- client can safely `upsert` "my current state" (e.g. via Supabase's
-- `upsert(..., { onConflict: 'user_id' })` / an `insert ... on conflict
-- (user_id) do update`) without a race ever producing two rows for the same
-- user. `payload jsonb` holds `{ active_epoch: ... }` today and can gain
-- more account-level fields later without a schema migration, same
-- JSONB-payload philosophy as the record tables above (see design note 1).

create table if not exists public.user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- `updated_at` is not part of the product spec's minimal shape but costs
-- nothing and is useful for last-write-wins conflict resolution across
-- devices; it's not enforced/triggered here, just a plain timestamp column
-- the client may set on upsert.


-- ============================================================================
-- Row Level Security
-- ============================================================================
-- RLS is enabled on every table, and every table gets four explicit
-- policies (SELECT / INSERT / UPDATE / DELETE) rather than one catch-all
-- `FOR ALL` policy, so the intent for each operation is unambiguous —
-- especially the INSERT policy, which must use `WITH CHECK`, not `USING`
-- (see design note 3 above). The effect is airtight either way; explicit
-- policies are just easier to audit.

alter table public.trials     enable row level security;
alter table public.ambient    enable row level security;
alter table public.sessions   enable row level security;
alter table public.blocks     enable row level security;
alter table public.epochs     enable row level security;
alter table public.user_state enable row level security;

-- ---- trials ----------------------------------------------------------------

drop policy if exists "trials_select_own" on public.trials;
create policy "trials_select_own" on public.trials
  for select
  using (auth.uid() = user_id);

drop policy if exists "trials_insert_own" on public.trials;
create policy "trials_insert_own" on public.trials
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "trials_update_own" on public.trials;
create policy "trials_update_own" on public.trials
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "trials_delete_own" on public.trials;
create policy "trials_delete_own" on public.trials
  for delete
  using (auth.uid() = user_id);

-- ---- ambient -----------------------------------------------------------

drop policy if exists "ambient_select_own" on public.ambient;
create policy "ambient_select_own" on public.ambient
  for select
  using (auth.uid() = user_id);

drop policy if exists "ambient_insert_own" on public.ambient;
create policy "ambient_insert_own" on public.ambient
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "ambient_update_own" on public.ambient;
create policy "ambient_update_own" on public.ambient
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "ambient_delete_own" on public.ambient;
create policy "ambient_delete_own" on public.ambient
  for delete
  using (auth.uid() = user_id);

-- ---- sessions ----------------------------------------------------------

drop policy if exists "sessions_select_own" on public.sessions;
create policy "sessions_select_own" on public.sessions
  for select
  using (auth.uid() = user_id);

drop policy if exists "sessions_insert_own" on public.sessions;
create policy "sessions_insert_own" on public.sessions
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "sessions_update_own" on public.sessions;
create policy "sessions_update_own" on public.sessions
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "sessions_delete_own" on public.sessions;
create policy "sessions_delete_own" on public.sessions
  for delete
  using (auth.uid() = user_id);

-- ---- blocks --------------------------------------------------------------

drop policy if exists "blocks_select_own" on public.blocks;
create policy "blocks_select_own" on public.blocks
  for select
  using (auth.uid() = user_id);

drop policy if exists "blocks_insert_own" on public.blocks;
create policy "blocks_insert_own" on public.blocks
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "blocks_update_own" on public.blocks;
create policy "blocks_update_own" on public.blocks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "blocks_delete_own" on public.blocks;
create policy "blocks_delete_own" on public.blocks
  for delete
  using (auth.uid() = user_id);

-- ---- epochs --------------------------------------------------------------

drop policy if exists "epochs_select_own" on public.epochs;
create policy "epochs_select_own" on public.epochs
  for select
  using (auth.uid() = user_id);

drop policy if exists "epochs_insert_own" on public.epochs;
create policy "epochs_insert_own" on public.epochs
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "epochs_update_own" on public.epochs;
create policy "epochs_update_own" on public.epochs
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "epochs_delete_own" on public.epochs;
create policy "epochs_delete_own" on public.epochs
  for delete
  using (auth.uid() = user_id);

-- ---- user_state ------------------------------------------------------------

drop policy if exists "user_state_select_own" on public.user_state;
create policy "user_state_select_own" on public.user_state
  for select
  using (auth.uid() = user_id);

drop policy if exists "user_state_insert_own" on public.user_state;
create policy "user_state_insert_own" on public.user_state
  for insert
  with check (auth.uid() = user_id);

drop policy if exists "user_state_update_own" on public.user_state;
create policy "user_state_update_own" on public.user_state
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "user_state_delete_own" on public.user_state;
create policy "user_state_delete_own" on public.user_state
  for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- End of schema
-- ============================================================================
