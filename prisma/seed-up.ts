/**
 * Full UP schools importer.
 *
 * Reads data/up_schools_2024-25_full.csv (262,358 rows) and loads:
 *   - District rows (one per unique CSV `district`)
 *   - Block rows   (one per unique (district, block) pair, code scoped to district)
 *   - School rows  (one per CSV `pseudocode`, mapped to School.udise)
 *
 * Idempotent: re-running picks up any pseudocodes not yet inserted and skips
 * districts/blocks that already exist. Existing rows are not modified.
 *
 * Run: npx tsx prisma/seed-up.ts   (or `npm run db:seed:up`)
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const CSV_PATH = path.resolve(__dirname, '..', 'data', 'up_schools_2024-25_full.csv');
const SCHOOL_BATCH = 5000;

// ─── CSV row parser (RFC 4180, single line, no embedded newlines) ───────────
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else cur += ch;
    } else {
      if (ch === ',') { out.push(cur); cur = ''; }
      else if (ch === '"') inQuotes = true;
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// ─── Coercion helpers ───────────────────────────────────────────────────────
function toStr(v: string | undefined): string { return (v ?? '').trim(); }
function toIntOrNull(v: string | undefined): number | null {
  const s = toStr(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

// Not consumed by the current Prisma schema, but kept as helpers since the
// CSV carries this data and downstream models may add columns for it later.
// (Yes/No → boolean coercion is documented here for future use.)
//
// Mapped CSV fields → Prisma School:
//   pseudocode      → udise (unique key)
//   school_name     → nameEn, nameHi  (synthetic; flagged via nameSynthetic)
//   district        → districtCode (slug) + District.nameEn/Hi
//   block           → blockCode (district-scoped slug) + Block.nameEn/Hi
//   school_category → category
//   lgd_vill_name + pincode → addressEn / addressHi
//
// NOT mapped (no field on the Prisma schema as of this commit — left to a
// later schema migration):
//   - All enr_* columns: enr_pp_boys/girls, enr_c1..c12_boys/girls,
//     enr_general/sc/st/obc_total and *_boys_cat / *_girls_cat, enr_total
//   - All facility/teacher columns: total_tch, *_lab_cond, toilets, water
//     sources, electricity, library, playground, ramps, ICT/lab equipment,
//     building_status, etc.
//   - All training/attendance columns
// These remain in the CSV on disk; future model edits can backfill from it.

function slugDistrict(name: string): string {
  return `D_${name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')}`;
}
function slugBlock(districtCode: string, name: string): string {
  const b = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${districtCode}__${b}`;
}

// ─── Read CSV header + iterator ─────────────────────────────────────────────
type Row = Record<string, string>;

async function* streamRows(): AsyncGenerator<Row> {
  const stream = fs.createReadStream(CSV_PATH, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | null = null;
  for await (const raw of rl) {
    if (!raw) continue;
    const cells = parseCsvLine(raw);
    if (!header) { header = cells.map((h) => h.trim()); continue; }
    const row: Row = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? '';
    yield row;
  }
}

// First pass: collect unique districts and (district, block) pairs.
async function collectGeo(): Promise<{
  districts: Map<string, { code: string; name: string }>;
  blocks: Map<string, { code: string; districtCode: string; name: string }>;
}> {
  console.log('Pass 1: scanning CSV for districts/blocks…');
  const districts = new Map<string, { code: string; name: string }>();
  const blocks = new Map<string, { code: string; districtCode: string; name: string }>();
  let n = 0;
  for await (const r of streamRows()) {
    const dName = toStr(r.district);
    const bName = toStr(r.block);
    if (!dName) continue;
    const dCode = slugDistrict(dName);
    if (!districts.has(dCode)) districts.set(dCode, { code: dCode, name: dName });
    if (bName) {
      const bCode = slugBlock(dCode, bName);
      if (!blocks.has(bCode)) blocks.set(bCode, { code: bCode, districtCode: dCode, name: bName });
    }
    if (++n % 50000 === 0) console.log(`  scanned ${n.toLocaleString()} rows…`);
  }
  console.log(`  done. ${districts.size} districts, ${blocks.size} blocks across ${n.toLocaleString()} rows.`);
  return { districts, blocks };
}

async function upsertDistricts(districts: Map<string, { code: string; name: string }>) {
  console.log(`Upserting ${districts.size} districts…`);
  for (const d of districts.values()) {
    await prisma.district.upsert({
      where: { code: d.code },
      create: { code: d.code, nameEn: d.name, nameHi: d.name },
      update: {},
    });
  }
}

async function upsertBlocks(blocks: Map<string, { code: string; districtCode: string; name: string }>) {
  console.log(`Upserting ${blocks.size} blocks…`);
  // Batch by chunks of ~200 inside a single transaction each, to keep round-trips low.
  const all = [...blocks.values()];
  const CHUNK = 200;
  for (let i = 0; i < all.length; i += CHUNK) {
    const slice = all.slice(i, i + CHUNK);
    await prisma.$transaction(
      slice.map((b) =>
        prisma.block.upsert({
          where: { code: b.code },
          create: { code: b.code, districtCode: b.districtCode, nameEn: b.name, nameHi: b.name },
          update: {},
        }),
      ),
    );
  }
}

function buildSchoolRecord(r: Row): Prisma.SchoolCreateManyInput | null {
  const udise = toStr(r.pseudocode);
  if (!udise) return null;

  const dName = toStr(r.district);
  const bName = toStr(r.block);
  if (!dName || !bName) return null;

  const districtCode = slugDistrict(dName);
  const blockCode = slugBlock(districtCode, bName);

  const name = toStr(r.school_name) || `School ${udise}`;
  const category = toStr(r.school_category) || 'UNSPECIFIED';

  // Build a simple address from village + district + pincode.
  const village = toStr(r.lgd_vill_name);
  const pincode = toStr(r.pincode);
  const addrParts = [village, bName, dName, 'Uttar Pradesh', pincode].filter(Boolean);
  const addr = addrParts.join(', ');

  return {
    udise,
    nameEn: name,
    nameHi: name, // CSV carries one synthetic name; both locales mirror it for now.
    nameSynthetic: true,
    category,
    districtCode,
    blockCode,
    addressEn: addr || null,
    addressHi: addr || null,
    publicPhone: null,
    feesRangeMin: null,
    feesRangeMax: null,
  };
}

async function importSchools() {
  console.log('Pass 2: loading existing school pseudocodes for idempotency…');
  // Selecting only the udise column keeps memory at ~few hundred MB even at 262k rows.
  const existingRows = await prisma.school.findMany({ select: { udise: true } });
  const existing = new Set(existingRows.map((s) => s.udise));
  console.log(`  ${existing.size.toLocaleString()} schools already present; will skip.`);

  let batch: Prisma.SchoolCreateManyInput[] = [];
  let scanned = 0;
  let inserted = 0;
  let skipped = 0;

  async function flush() {
    if (batch.length === 0) return;
    const res = await prisma.school.createMany({ data: batch, skipDuplicates: true });
    inserted += res.count;
    batch = [];
  }

  console.log('Pass 2: inserting schools…');
  for await (const r of streamRows()) {
    scanned++;
    const rec = buildSchoolRecord(r);
    if (!rec) { skipped++; continue; }
    if (existing.has(rec.udise)) continue;
    batch.push(rec);
    if (batch.length >= SCHOOL_BATCH) {
      await flush();
      console.log(`  ${scanned.toLocaleString()} scanned · ${inserted.toLocaleString()} inserted`);
    }
  }
  await flush();
  console.log(`Schools done. Scanned ${scanned.toLocaleString()}, inserted ${inserted.toLocaleString()}, skipped malformed ${skipped}.`);
}

async function main() {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found at ${CSV_PATH}. Download it before seeding.`);
  }

  const { districts, blocks } = await collectGeo();
  await upsertDistricts(districts);
  await upsertBlocks(blocks);
  await importSchools();

  const [dCount, bCount, sCount] = await Promise.all([
    prisma.district.count(),
    prisma.block.count(),
    prisma.school.count(),
  ]);
  console.log('\nFinal counts:');
  console.log(`  districts: ${dCount.toLocaleString()}`);
  console.log(`  blocks:    ${bCount.toLocaleString()}`);
  console.log(`  schools:   ${sCount.toLocaleString()}`);
  if (sCount !== 262358) {
    console.warn(`!! School count is ${sCount}, expected 262358.`);
  } else {
    console.log('School count matches expected 262358.');
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
