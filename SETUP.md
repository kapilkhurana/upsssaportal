# Local setup — UP SSSA portal

Run the entire portal locally with the full 262,358-school dataset. No cloud services involved.

## Prerequisites

- Node.js 20+ (the repo was tested on 24)
- Docker Desktop (for the local Postgres container) OR a native Postgres 16+ listening on `localhost:5432` with role `postgres` / password `postgres` and an empty database called `upsssa`
- The dataset CSV: `data/up_schools_2024-25_full.csv` (262,358 rows; this file is gitignored — drop it into `data/` from wherever you keep it)

## 1. Start the database

Easiest path is a single Docker container:

```bash
docker run -d --name upsssa-db \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=upsssa \
  -p 5432:5432 \
  postgres:16
```

If a native PostgreSQL service is already listening on `5432`, stop it first — both can't share the port (`net stop postgresql-x64-18` on Windows, or via the Services panel).

## 2. Environment file

Copy `.env.example` to `.env` and edit:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/upsssa?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/upsssa?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="<generate one: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\">"
AUTH_SECRET="<same value as NEXTAUTH_SECRET>"
```

Both `NEXTAUTH_SECRET` and `AUTH_SECRET` are read by `src/lib/auth.ts`; setting both keeps next-auth v5 happy across versions.

## 3. Install dependencies and apply the schema

```bash
npm install
npx prisma db push
```

`postinstall` runs `prisma generate` automatically. `db push` creates all tables (no migration history needed for local dev).

## 4. Seed the data

Order matters: load real schools first, then layer demo users on top.

```bash
# (a) full school dataset — 262,358 rows, ~3-5 minutes on a laptop
npm run db:seed:up

# (b) demo users, cycle, dispute categories, rating dimensions
npm run db:seed
```

Both seeds are idempotent — safe to re-run.

After step (a) you should see:

```
Final counts:
  districts: 75
  blocks:    960
  schools:   2,62,358
School count matches expected 262358.
```

Step (b) detects the real schools and binds the SCHOOL demo user to the first real `pseudocode` from the CSV. It prints the four demo logins it created. Example:

```
SSSA       :  sssa / admin123
School     :  1000070 / school123
Verifier   :  verifier1 / verifier123
District   :  district1 / district123  (districtCode=D_PRAYAGRAJ)
```

The exact school username depends on the lowest pseudocode in your DB.

## 5. Run the app

```bash
npm run dev
```

Open http://localhost:3000.

- `/public` — public landing page
- `/public/directory` — paginated, filterable directory of all 262,358 schools (server-side search/filter; safe at scale)
- `/public/find` — find-a-school flow
- `/public/schools/<pseudocode>` — school profile (shows the “sample data” banner because all CSV names are synthetic)
- `/login` — pick a role and use the credentials printed by the seed

## What's deferred

The following are not done in this branch; track separately:

1. **Enrolment / facility columns are not loaded into Prisma.** The CSV carries 200+ columns (enr_c1..c12_*, *_lab_cond, total_tch, toilets, water sources, etc.) but the current `School` model has no fields for them. `prisma/seed-up.ts` has an explicit comment listing these. To load them, extend the schema and add the mapping in `seed-up.ts:buildSchoolRecord`.
2. **Public dashboard components still use synthetic derivations.** `src/lib/public/schoolProfile.ts` derives scores, attendance, dropout, infrastructure tags from a hash of UDISE — flagged with a `NOTE:` comment. Replace once the schema carries the underlying columns.
3. **Compare/Reports/Home rich charts still pull from `dummyData.ts`.** They depend on aggregate score data the schema does not yet hold; the dummy data structure is unchanged. Same fix applies — add columns, then swap.
4. **District codes are slugged from district names** (e.g. `D_PRAYAGRAJ`). Replace with real LGD codes when an authoritative mapping is available; the `District.code` field is unique so a follow-up rename script is feasible.
5. **Name verification.** Once real, non-synthetic names are loaded for a subset of schools, set `nameSynthetic = false` on those rows. The directory / find / profile pages already check this per-record — the banner will disappear for any school flipped to non-synthetic without further code changes.

## Common issues

- **`P1000: Authentication failed`** — another Postgres is on `5432`. Stop it or remap the Docker container to a different host port and update `DATABASE_URL`.
- **`Environment variable not found: DIRECT_URL`** — the Prisma schema requires both `DATABASE_URL` and `DIRECT_URL`. Point both at the same URL for local use.
- **Seed prints `School count is N, expected 262358`** — usually means the CSV is truncated. Verify with `wc -l data/up_schools_2024-25_full.csv` (header + 262,358 rows = 262,359 lines).
