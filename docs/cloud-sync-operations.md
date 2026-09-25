# Cloud synchronization: deployment and operations

## Enable cloud accounts

1. Create or select a Supabase project. Enable email/password Auth and configure the site URL and allowed redirects for the deployed AP Trainer origin.
2. Apply `supabase/migrations/202609220001_sync.sql` in the SQL editor, or use your normal Supabase migration workflow. This is the authoritative protocol. `supabase/schema.sql` is the earlier, unused scaffold; do not apply it after the new migration. The migration preserves old scaffold tables but revokes their client access. If those tables already contain real records, migrate them deliberately before enabling this client; this implementation does not assume they are populated.
3. Copy `.env.local.example` to `.env.local` for local development, or set its two Vite variables in your deployment provider. Use only the public anon key, never the service-role key.
4. Build/redeploy the frontend. Without configuration it remains local-only.
5. Before calling the deployment complete, use two real accounts and two devices: verify email confirmation/sign-in, offline trial saves, eventual union on both devices, sign-out separation, and authorization denial for requests made with the other user's token. Automated tests below validate the protocol locally but do not provision or test a hosted Supabase project.

## User behavior

Account controls sit above the trainer. Training and analytics use IndexedDB; network requests never participate in saving an answer. Sync runs at startup, after writes (debounced), online/foreground transitions, every minute, and via Sync now. RPC requests have a 30-second timeout. Failed uploads remain queued; malformed records remain visible as sync errors while valid later records continue uploading.

Local-only training remains available. First sign-in offers an explicit attachment of this browser's local history. The history becomes private to that account; the source is retained as an archive and cannot be claimed by another account. Interrupted attachment resumes for its owner. When an otherwise empty account adopts local history, it adopts that history's current epoch; an account already containing trials keeps its existing selected epoch. Logging out creates/returns to an independent local-only namespace. Account changes reload the app, terminating old training callbacks rather than allowing them to write under the new identity.

A previously authenticated account can continue local training offline. This does not make the application an installable offline PWA: loading app assets on a never-visited device still requires connectivity. Synced history refreshes the Dashboard and curriculum at safe boundaries, never replacing a playing trial. Existing per-session manual statistics rebuild at session start.

## Data rules

All five durable history stores synchronize with complete JSON payloads and stable UUIDs. Event ordering is timestamp then UUID, while server revisions govern synchronization. Blocks and epochs retain historical decisions; estimates are recomputed locally. Sessions only gain an end time. Immutable UUID collisions use the first accepted payload. User metadata uses per-key logical-clock/device ordering; the cursor and device/migration keys never enter portable backups.

Server functions derive ownership from Auth, never from a supplied user_id. RLS restricts reads. Direct inserts, updates and deletes are revoked even for authenticated users; RPCs are the only mutation path. The per-user account lock serializes revision allocation and commits, so an incremental cursor cannot skip an older transaction that commits late. Pulls are bounded; an unchanged sync transfers no historical rows. No auth tokens or full training history are logged.

Multiple offline devices may independently start/reset epochs. Automatic startup selection does not overwrite an already established cloud epoch. Explicit resets select one deterministic metadata version while preserving all historical epochs and trials. Device time is preserved, including possible clock skew; it is never used as the cloud cursor.

## Backups, cache clearing, deletion

JSON export includes raw history and supported user metadata with owner identity, excluding replication internals. CSV remains available. Repeated import merges by UUID; older UUID-less backup rows receive deterministic content IDs. Authenticated import rejects a backup explicitly owned by another account, and asks before attaching an ownerless legacy backup.

Dashboard distinguishes clearing local history (logged out) from clearing the downloaded cache (signed in). Cache clearing refuses pending uploads and resets the pull cursor; it never deletes cloud history. Account settings provide a separate confirmed Delete my history everywhere command. That command advances a persistent server generation. Reconnecting old devices archive their pending records for recovery and clear stale replicas before any upload, preventing deleted history from being resurrected. Recovery exports are intentionally not ordinary importable backups; restoring those records requires an explicit decision and conversion. After deletion, old offline browser copies cannot be remotely erased until the browser reconnects.

Deleting the Supabase Auth user cascades cloud rows. This app exposes history deletion, not self-service Auth-account deletion; an operator can delete the Auth account through Supabase. Local caches and manually exported backups still need explicit removal on their devices.

## Verification

- `npm test`: existing audio/learner tests plus real IndexedDB-semantic migration, atomic outbox, backup, pagination, conflict, deletion, and PGlite/PostgreSQL authorization/protocol tests.
- `npm run test:cloud-browser`: isolated Chrome profile with simulated Auth endpoints and real SQL RPC execution. Exercises legacy migration, sign-in, history attachment, A/B/A account separation, offline persistence, and the mobile Dashboard.
- `npm run test:cloud-large`: 100,000 server observations pulled into IndexedDB; subsequent synchronization must transfer zero historical rows.
- `npm run build`: production build.
- Existing full lint has baseline failures outside the new cloud modules. See the work report for exact results; do not infer full lint passes from a clean targeted lint.

The browser scripts use installed Google Chrome and do not touch your normal browser profile. Test screenshots and logs go under `artifacts/cloud-sync/`.

## Rollback

Disable cloud environment configuration and redeploy only if users have exported account backups and understand that local-only mode uses a different namespace. Account databases remain on disk; turning cloud configuration back on and signing in restores access. Keep IndexedDB version 3 and its migration code. Do not roll back to an older app that tries to open version 2, and never delete databases or cloud tables as a rollback procedure.

## Limits and follow-up validation

Hosted Auth, production redirects, and hosted RLS have now been configured and verified as recorded below. Public email delivery remains conditional on the signup-policy choice. Physical phone-to-computer testing remains useful beyond the independent hosted clients tested here. Backup/export and analytics can still load complete histories in memory as before; the replication protocol itself is paginated. Claiming an account's local data is UI isolation, not encryption against someone with access to the same browser profile's developer tools.

## Hosted deployment (2026-09-22)

- Production: https://project-zfztu.vercel.app (Vercel project `project-zfztu`).
- Supabase project: `efecsbpyockuydkgyqva`, free tier, East US. The authoritative migration is applied; production and preview have the public connection variables.
- Hosted verification used two temporary confirmed Auth users and independent client repositories. Account isolation, anonymous denial, two-device union, retry after response loss, and deletion without resurrection passed. The production browser signed in, reached Synced, and displayed the downloaded trial in Dashboard.
- Site URL and allowed redirect are the production origin. Email confirmation remains enabled pending the owner's signup-policy choice. Supabase's default email service only delivers to project team addresses; public signup requires custom SMTP or an explicit decision to disable confirmation.
- Offline training works in an already loaded app. A forced offline page reload is not supported; this release does not install a service worker.
