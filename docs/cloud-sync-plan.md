# Cloud synchronization implementation plan

## Inspection and architecture

React (`main.jsx` -> `App.jsx`) currently reads one `ap-trainer` v2 IndexedDB through `src/db/db.js`. `Curriculum.jsx` writes trials, blocks, sessions and epochs; `useGameState.js` writes manual/progression trials, manual blocks and sessions; `AmbientLog.jsx` writes ambient observations. Progression trials lack UUIDs at construction, so persistence must guarantee them. Sessions, blocks and epochs already use UUIDs. Sessions mutate only to add an end time; other history is append-only. Preserve entire JSON payloads including legacy aliases, nullable fields, arrays, embedded session context and version provenance. Schema version 2 denotes curriculum-compatible observations, not the cloud protocol.

`main.jsx` starts UUID backfill without awaiting it. Existing keyless auto-increment stores must retain physical keys during backfill. `getAllTrials()` currently returns insertion order; consumers use `.at(-1)` and slices. Return timestamp/id order, including deterministic ties in model and block sorting. `estimate()` reconstructs acquisition/retention from observations; scheduler decision snapshots in blocks are durable history. Do not synchronize model estimates independently.

## Complete store and metadata classification

- trials, ambient, blocks, epochs: durable immutable history.
- sessions: durable history; completion monotonically fills `ended_at` (later end wins), never replace immutable context.
- meta.curriculumEpoch: durable user selection; synchronize through versioned metadata.
- meta.candidateOverride: durable human curriculum choices; synchronize per-key deterministic version order.
- meta.level, streak, lastTrialTime, responseWindowMs: manual-practice state, persisted user state; synchronize per key (lastTrialTime takes max). They are not curriculum learner estimates.
- meta.adaptiveMode, notExactMode, noiseScrambleMode: user preferences; synchronize per key.
- meta.readinessPerturbation: one-shot device experiment; local only to avoid consuming twice across devices.
- meta.uuidBackfillV1: local migration marker; never import or upload it.
- localStorage.theme: device appearance; local only.
- new outbox, cursor, migration, generation, device identity and conflict/recovery state: local only; excluded from portable backups.

## Selected persistence and synchronization design

Use a repository instance permanently bound to one database name. Logged-out data stays in `ap-trainer`; authenticated data uses `ap-trainer:<auth UUID>`. Switching remounts training and stops audio before changing the active repository. Old asynchronous work retains its captured repository; reject stale facade writes after a switch. Never fall back to another user's namespace on errors.

Choose explicit atomic outbox over per-record dirty fields (would contaminate backup payloads) and set reconciliation (full-history scans). IndexedDB v3 adds logical-id indexes, an outbox and sync metadata. Local writes and outbox entries commit together. Each entry has a revision token; acknowledge only that exact token so concurrent updates survive. One-time cursor migration seeds existing data in bounded transactions while preserving physical keys. Pull merge and cursor advance commit together. UUID-less legacy backup rows receive deterministic content IDs, making repeated imports idempotent.

Cloud: add `ap_sync_records` with composite owner/kind/logical-id key, JSONB payload, device UUID, server revision and creation timestamp; `ap_sync_accounts` holds per-user revision and history generation. Metadata uses named logical keys; event IDs must be UUIDs. RLS allows only own-row reads; revoke direct writes. Authenticated RPCs derive ownership exclusively from `auth.uid()`, set an empty search_path and explicitly qualify tables. Per-user row lock serializes writes, revision allocation, pulls and deletion, avoiding sequence commit-order cursor gaps. Upload batches return per-row acknowledgements/errors, isolating malformed historical rows. Paginate by committed revision, never device timestamps. Existing undeployed schema is retained as legacy scaffolding; document the new migration as authoritative and revoke old write paths.

Trials/ambient/blocks/epochs use first accepted payload for a UUID. Sessions merge only end time. User metadata requires mutation: compare persisted `(logical clock, device UUID)` versions per key; update local clock on pull. Clock skew may influence event chronology and existing learning calculations; preserve original timestamps, do not rewrite evidence. Server revisions exclusively control replication. Explicit epoch resets keep historical epochs, and synchronized selected epoch identifies current training context.

## Identity, migration and UI

Email/password with existing lazy Supabase client; retain offline local-only mode. Anonymous Supabase auth is deliberately omitted: local-only use needs no network or temporary cloud account. Subscribe outside React for lifecycle ownership; never await Supabase calls inside Auth callbacks. Delay mounting training until local identity initialization completes, but never await network synchronization to save trials.

Offer clearly labeled, explicit attachment of logged-out history to the signed-in account. Reserve the source namespace to the chosen account before copying; resume by UUID after interruption. Keep the original archive inaccessible to other accounts and logged-out UI. An empty account may pull existing history before choosing epoch; reconcile at safe training boundaries, not mid-trial. Account controls, sync status, retry and last-success state live in a compact account surface.

Pull invalidation refreshes Dashboard immediately and Curriculum at home/summary boundaries; manual practice rebuilds history-dependent stats at session start. Never remount an active trial for ordinary sync. Sign-out stops training and switches local namespace. Multiple tabs use browser locks for migration/sync and captured repository identity for writes.

## Backup and deletion

Keep full-fidelity exportJSON, importJSON and CSV APIs. Backup includes owner identity and durable/user metadata, never cursor/device/outbox internals. Reject explicitly foreign-owned backups; legacy ownerless backups are attached only through explicit import UI. Import merges all stores by logical ID, queues atomically and retains existing immutable events. Clear local cache refuses pending uploads, resets pull cursor, and never deletes cloud history. Delete everywhere is a distinct confirmed action: increment server history generation under lock and clear cloud rows. An old device must check generation before upload; on mismatch, archive pending local records into recovery storage before clearing its stale replica. Recovery is export-only, never automatically re-uploaded.

## Files and ordered phases

1. Add this inspected plan, `src/db/repository.js`, upgrade `src/db/db.js` while preserving its public API and CSV helpers; add repository integration tests using real IndexedDB semantics.
2. Add `supabase/migrations/202609220001_sync.sql`, `src/cloud/engine.js`, and transport/runtime modules. Add SQL authorization/protocol tests and sync fault/convergence tests.
3. Wire `src/main.jsx`, `src/components/Auth.jsx`, account UI and `App.jsx`; update Dashboard/Curriculum refresh points, model tie ordering and safe training lifecycle.
4. Add reproducible browser smoke checks, update package scripts, `.env.local.example`, README and deployment instructions. Run targeted tests, full Node suite, build and browser verification.

## Verification and deployment

Tests: legacy physical-key migration, offline saves/reopen, atomic outbox/ack races, paginated duplicate pulls, two-device union, response loss retries, malformed row isolation, large histories (100,000 rows), namespace separation, migration restart, backup repeated import, generation deletion without resurrection, session completion, deterministic ordering, RLS read/insert/update/delete denial across identities and anonymous RPC denial. Use a local PostgreSQL-compatible test runtime; report separately whether live Supabase was available.

Deploy migration first, configure VITE_SUPABASE_URL and public VITE_SUPABASE_ANON_KEY on the hosting provider, enable email/password and allowed redirect origins. Repository remote is mehurtado/ap-trainer; no checked-in hosting config or actual project credentials are present. Never create/use browser service-role keys. Live provider setup and two-user network verification require an actual configured project. Rollback by disabling cloud configuration preserves local databases and backups; do not downgrade DB_VERSION or delete account namespaces. Preserve unrelated untracked docs/artifacts. No push or production deploy was requested.

## Risks and acceptance gates

Account partitioning is application isolation, not protection against someone with DevTools access to the same OS/browser profile. Cloud RLS is the adversarial boundary. Concurrent offline explicit epoch resets select one durable metadata version but preserve both histories. Local caches can require user disk cleanup after large histories; pending data must never be silently discarded. Cloud generation reset preserves unsynced evidence only in private recovery backup. Full-history analytics remains existing local behavior and may be expensive at high volume; replication itself must stay incremental. Do not claim production synchronization until real Supabase authentication and RLS are exercised.
