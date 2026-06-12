/**
 * Reference seed: demo users, cycle, dispute categories, rating dimensions.
 *
 * Behaviour:
 *   - If real schools have already been loaded (via prisma/seed-up.ts), this
 *     skips the dummy district/block/school inserts and binds the demo SCHOOL
 *     and DISTRICT users to real records pulled from the DB.
 *   - Otherwise it falls back to seeding the small dummy district/block/school
 *     set so the app still has something to render.
 *
 * Run: npx tsx prisma/seed.ts  (or `npm run db:seed`)
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── Dummy fallback (only used when DB has no real schools) ───────────────
const dummyDistricts = [
  { code: 'D001', nameEn: 'Lucknow', nameHi: 'लखनऊ' },
  { code: 'D002', nameEn: 'Varanasi', nameHi: 'वाराणसी' },
];

const dummyBlocks = [
  { code: 'B001', districtCode: 'D001', nameEn: 'Mohanlalganj', nameHi: 'मोहनलालगंज' },
  { code: 'B002', districtCode: 'D001', nameEn: 'Bakshi Ka Talab', nameHi: 'बक्शी का तालाब' },
  { code: 'B003', districtCode: 'D002', nameEn: 'Pindra', nameHi: 'पिंडरा' },
  { code: 'B004', districtCode: 'D002', nameEn: 'Sevapuri', nameHi: 'सेवापुरी' },
];

const dummyCategories = ['Primary', 'Upper Primary', 'Secondary'];

function buildDummySchools() {
  const out: {
    udise: string; nameEn: string; nameHi: string; category: string;
    districtCode: string; blockCode: string;
    addressEn: string | null; addressHi: string | null;
    publicPhone: string | null; feesRangeMin: number | null; feesRangeMax: number | null;
  }[] = [];
  for (const block of dummyBlocks) {
    for (let i = 1; i <= 5; i++) {
      const blockIdx = dummyBlocks.indexOf(block);
      const globalIdx = blockIdx * 5 + i;
      const udise = `0901${String(blockIdx + 1).padStart(3, '0')}${String(i).padStart(4, '0')}`;
      const cat = dummyCategories[(i - 1) % 3];
      out.push({
        udise,
        nameEn: `${block.nameEn} ${cat} School ${i}`,
        nameHi: `${block.nameHi} ${cat} विद्यालय ${i}`,
        category: cat,
        districtCode: block.districtCode,
        blockCode: block.code,
        addressEn: i % 2 === 1 ? `${block.nameEn}, Uttar Pradesh` : null,
        addressHi: i % 2 === 1 ? `${block.nameHi}, उत्तर प्रदेश` : null,
        publicPhone: i % 3 === 1 ? `+91 522${String(1000000 + globalIdx)}` : null,
        feesRangeMin: i <= 3 ? 0 : 500,
        feesRangeMax: i <= 3 ? 0 : 2500,
      });
    }
  }
  out.push({
    udise: '11111111111',
    nameEn: 'Demo Model School',
    nameHi: 'डेमो मॉडल विद्यालय',
    category: 'Secondary',
    districtCode: 'D001',
    blockCode: 'B001',
    addressEn: 'Mohanlalganj, Lucknow, Uttar Pradesh',
    addressHi: 'मोहनलालगंज, लखनऊ, उत्तर प्रदेश',
    publicPhone: '+91 5221234567',
    feesRangeMin: 0,
    feesRangeMax: 0,
  });
  return out;
}

// ─── Reference data ───────────────────────────────────────────────────────
const seedCycle = { name: '2025-26', isActive: true };

const seedDimensions = [
  { code: 'TEACHING', labelEn: 'Teaching Quality', labelHi: 'शिक्षण गुणवत्ता', order: 1 },
  { code: 'INFRA', labelEn: 'Infrastructure', labelHi: 'बुनियादी ढाँचा', order: 2 },
  { code: 'SAFETY', labelEn: 'Safety & Security', labelHi: 'सुरक्षा', order: 3 },
  { code: 'HYGIENE', labelEn: 'Hygiene & Cleanliness', labelHi: 'स्वच्छता', order: 4 },
  { code: 'ADMIN', labelEn: 'Administration', labelHi: 'प्रशासन', order: 5 },
];

const seedDisputeCategories = [
  { code: 'CAT_FEE_FALSE', nameEn: 'False Fee Information', nameHi: 'गलत शुल्क जानकारी' },
  { code: 'CAT_INFRA_FALSE', nameEn: 'False Infrastructure Claims', nameHi: 'गलत बुनियादी ढाँचा दावे' },
  { code: 'CAT_SAFETY', nameEn: 'Safety Concern', nameHi: 'सुरक्षा चिंता' },
  { code: 'CAT_GRADE_DISPUTE', nameEn: 'Grade / Score Dispute', nameHi: 'ग्रेड / अंक विवाद' },
  { code: 'CAT_STAFF_CONDUCT', nameEn: 'Staff Conduct Issue', nameHi: 'कर्मचारी आचरण समस्या' },
  { code: 'CAT_OTHER', nameEn: 'Other', nameHi: 'अन्य' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────
async function ensureUser(
  username: string,
  password: string,
  role: string,
  extra: { districtCode?: string | null; verifierCapacity?: number } = {},
) {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    // Keep districtCode in sync if a real district code is being supplied.
    if (extra.districtCode !== undefined && existing.districtCode !== extra.districtCode) {
      await prisma.user.update({ where: { username }, data: { districtCode: extra.districtCode } });
    }
    console.log(`  exists: ${username} (${role})`);
    return;
  }
  await prisma.user.create({
    data: {
      username,
      passwordHash: await bcrypt.hash(password, 10),
      role,
      districtCode: extra.districtCode ?? null,
      ...(extra.verifierCapacity ? { verifierCapacity: extra.verifierCapacity } : {}),
    },
  });
  console.log(`  created: ${username} (${role})`);
}

// ─── Main ─────────────────────────────────────────────────────────────────
async function main() {
  const schoolCount = await prisma.school.count();
  const realSchoolsLoaded = schoolCount > 1000;

  if (realSchoolsLoaded) {
    console.log(`Real schools detected (${schoolCount.toLocaleString()}). Skipping dummy district/block/school inserts.`);
  } else {
    console.log('Seeding dummy districts…');
    for (const d of dummyDistricts) {
      await prisma.district.upsert({ where: { code: d.code }, update: {}, create: d });
    }
    console.log('Seeding dummy blocks…');
    for (const b of dummyBlocks) {
      await prisma.block.upsert({ where: { code: b.code }, update: {}, create: b });
    }
    console.log('Seeding dummy schools…');
    for (const s of buildDummySchools()) {
      await prisma.school.upsert({ where: { udise: s.udise }, update: {}, create: s });
    }
  }

  // Pick demo-binding targets from the live data (real or dummy)
  const anySchool = await prisma.school.findFirst({
    orderBy: { udise: 'asc' },
    select: { udise: true, districtCode: true },
  });
  const anyDistrict = await prisma.district.findFirst({ orderBy: { code: 'asc' }, select: { code: true } });

  const schoolUsername = anySchool?.udise ?? '11111111111';
  const districtCode = anySchool?.districtCode ?? anyDistrict?.code ?? 'D001';

  console.log('Seeding demo users…');
  await ensureUser('sssa', 'admin123', 'SSSA_ADMIN');
  await ensureUser(schoolUsername, 'school123', 'SCHOOL');
  await ensureUser('verifier1', 'verifier123', 'VERIFIER', { verifierCapacity: 50 });
  await ensureUser('district1', 'district123', 'DISTRICT_OFFICIAL', { districtCode });

  console.log('Seeding cycle…');
  await prisma.cycle.upsert({ where: { name: seedCycle.name }, update: {}, create: seedCycle });

  console.log('Seeding rating dimensions…');
  for (const d of seedDimensions) {
    await prisma.ratingDimension.upsert({ where: { code: d.code }, update: {}, create: d });
  }

  console.log('Seeding dispute categories…');
  for (const c of seedDisputeCategories) {
    await prisma.disputeCategory.upsert({ where: { code: c.code }, update: {}, create: c });
  }

  // Ensure an active cycle has a framework attached so school/verifier pages don't crash.
  const activeCycle = await prisma.cycle.findFirst({ where: { isActive: true } });
  if (activeCycle) {
    const fw = await prisma.framework.findUnique({ where: { cycleId: activeCycle.id } });
    if (!fw) {
      console.log('Creating empty Framework for active cycle…');
      await prisma.framework.create({
        data: { cycleId: activeCycle.id, status: 'PUBLISHED', publishedAt: new Date() },
      });
    }
  }

  console.log('\nDemo logins:');
  console.log(`  SSSA       :  sssa / admin123`);
  console.log(`  School     :  ${schoolUsername} / school123`);
  console.log(`  Verifier   :  verifier1 / verifier123`);
  console.log(`  District   :  district1 / district123  (districtCode=${districtCode})`);
  console.log('Done.');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
