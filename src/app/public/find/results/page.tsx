import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { prisma } from '@/lib/db';
import { computeAge, ageToGrade, gradeLabel } from '@/lib/age-to-grade';
import { ResultsSortSelect } from '@/components/public/ResultsSortSelect';
import { FindResultsTable, type FindResultRow } from '@/components/public/FindResultsTable';
import { SyntheticDataBanner } from '@/components/public/SyntheticDataBanner';
import { searchSchools } from '@/lib/actions/findSchools';
import type { Prisma } from '@prisma/client';

const PAGE_SIZE = 50;

type SortKey = 'name_asc' | 'name_desc' | 'fees_asc' | 'fees_desc';

function buildOrderBy(sort: SortKey): Prisma.SchoolOrderByWithRelationInput[] {
  switch (sort) {
    case 'fees_asc':
      return [{ feesRangeMin: { sort: 'asc', nulls: 'last' } }, { nameEn: 'asc' }];
    case 'fees_desc':
      return [{ feesRangeMax: { sort: 'desc', nulls: 'last' } }, { nameEn: 'asc' }];
    case 'name_desc':
      return [{ nameEn: 'desc' }];
    default:
      return [{ nameEn: 'asc' }];
  }
}

async function loadResults(
  district: string,
  block: string,
  districtName: string,
  blockName: string,
  feesMin?: number,
  feesMax?: number,
  sort: SortKey = 'name_asc',
): Promise<{ rows: FindResultRow[]; anySynthetic: boolean }> {
  try {
    const where: Prisma.SchoolWhereInput = {};
    if (district) where.districtCode = district;
    if (block) where.blockCode = block;

    if (feesMin !== undefined || feesMax !== undefined) {
      const overlap: Prisma.SchoolWhereInput = {};
      if (feesMax !== undefined) overlap.feesRangeMin = { lte: feesMax };
      if (feesMin !== undefined) overlap.feesRangeMax = { gte: feesMin };
      where.OR = [
        {
          AND: [
            { feesRangeMin: { not: null } },
            { feesRangeMax: { not: null } },
            overlap,
          ],
        },
        { feesRangeMin: null },
        { feesRangeMax: null },
      ];
    }

    const schools = await prisma.school.findMany({
      where,
      select: {
        udise: true,
        nameEn: true,
        nameSynthetic: true,
        district: { select: { nameEn: true } },
        block: { select: { nameEn: true } },
      },
      orderBy: buildOrderBy(sort),
      take: PAGE_SIZE,
    });

    if (schools.length > 0) {
      return {
        rows: schools.map((s) => ({
          udise: s.udise,
          name: s.nameEn,
          districtName: s.district.nameEn,
          blockName: s.block.nameEn,
        })),
        anySynthetic: schools.some((s) => s.nameSynthetic),
      };
    }
  } catch {
    // use server action fallback below
  }

  const { schools } = await searchSchools({
    districtCode: district,
    districtName: districtName || district,
    blockCode: block,
    blockName: blockName || block,
    feesMin,
    feesMax,
  });

  return {
    rows: schools.map((s) => ({
      udise: s.udise,
      name: s.name,
      districtName: s.districtName,
      blockName: s.blockName,
    })),
    anySynthetic: schools.length > 0,
  };
}

export default async function FindResultsPage(props: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const searchParams = await props.searchParams;

  const district = (searchParams.district as string) || '';
  const block = (searchParams.block as string) || '';
  const dob = (searchParams.dob as string) || '';
  const sex = (searchParams.sex as string) || '';
  const specialNeeds = (searchParams.specialNeeds as string) || 'not_applicable';
  const feesMinParam = parseInt((searchParams.feesMin as string) || '', 10);
  const feesMaxParam = parseInt((searchParams.feesMax as string) || '', 10);
  const sort = ((searchParams.sort as string) || 'name_asc') as SortKey;

  let computedGrade: number | null = null;
  if (dob) {
    const date = new Date(dob);
    if (!Number.isNaN(date.getTime())) {
      computedGrade = ageToGrade(computeAge(date));
    }
  }

  const [districtData, blockData] = await Promise.all([
    district
      ? prisma.district
          .findUnique({ where: { code: district }, select: { nameEn: true } })
          .catch(() => null)
      : null,
    block
      ? prisma.block.findUnique({ where: { code: block }, select: { nameEn: true } }).catch(() => null)
      : null,
  ]);

  const districtName = districtData?.nameEn ?? (searchParams.districtName as string) ?? '';
  const blockName = blockData?.nameEn ?? (searchParams.blockName as string) ?? '';

  const feesMin = Number.isNaN(feesMinParam) ? undefined : feesMinParam;
  const feesMax = Number.isNaN(feesMaxParam) ? undefined : feesMaxParam;

  let { rows, anySynthetic } = await loadResults(district, block, districtName, blockName, feesMin, feesMax, sort);

  if (sort === 'name_desc') {
    rows = [...rows].sort((a, b) => b.name.localeCompare(a.name));
  }

  const total = rows.length;
  const from = total === 0 ? 0 : 1;
  const to = total;

  const sexLabels: Record<string, string> = {
    male: 'Male',
    female: 'Female',
    other: 'Other',
    M: 'Male',
    F: 'Female',
    T: 'Other',
  };

  function sortHref(s: string) {
    const params = new URLSearchParams();
    if (district) params.set('district', district);
    if (block) params.set('block', block);
    if (districtName) params.set('districtName', districtName);
    if (blockName) params.set('blockName', blockName);
    if (dob) params.set('dob', dob);
    if (sex) params.set('sex', sex);
    if (specialNeeds !== 'not_applicable') params.set('specialNeeds', specialNeeds);
    if (feesMin !== undefined) params.set('feesMin', String(feesMin));
    if (feesMax !== undefined) params.set('feesMax', String(feesMax));
    if (s !== 'name_asc') params.set('sort', s);
    const qs = params.toString();
    return `/public/find/results${qs ? `?${qs}` : ''}`;
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/public/find"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-[#1B2A6B] hover:underline"
      >
        <ArrowLeft size={16} />
        Back to search
      </Link>

      <h1 className="text-2xl font-bold text-[#1B2A6B] sm:text-3xl">Search Results</h1>

      {anySynthetic && <SyntheticDataBanner scope="list" />}

      <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
          {districtName && (
            <span>
              <span className="font-medium text-gray-800">District:</span> {districtName}
            </span>
          )}
          {blockName && (
            <span>
              <span className="font-medium text-gray-800">Block:</span> {blockName}
            </span>
          )}
          {sex && (
            <span>
              <span className="font-medium text-gray-800">Sex:</span>{' '}
              {sexLabels[sex] ?? sex}
            </span>
          )}
          {computedGrade !== null && (
            <span>
              <span className="font-medium text-gray-800">Eligible grade:</span>{' '}
              {gradeLabel(computedGrade, 'en')}
            </span>
          )}
        </div>
      </div>

      <p className="mt-4 rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
        Grade-based filtering is not available in demo data. All schools in the selected area are
        shown.
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          {total > 0 ? `Showing ${from}–${to} of ${total}` : 'Showing 0 of 0'}
        </p>
        {total > 0 && (
          <ResultsSortSelect
            current={sort}
            sortHrefs={{
              name_asc: sortHref('name_asc'),
              name_desc: sortHref('name_desc'),
              fees_asc: sortHref('fees_asc'),
              fees_desc: sortHref('fees_desc'),
            }}
          />
        )}
      </div>

      {total > 0 ? (
        <div className="mt-4">
          <FindResultsTable rows={rows} />
        </div>
      ) : (
        <p className="mt-8 text-center text-gray-600">No schools found for the selected area.</p>
      )}
    </div>
  );
}
