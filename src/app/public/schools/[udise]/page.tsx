import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import { SchoolProfileContent } from '@/components/public/SchoolProfileContent';
import { SyntheticDataBanner } from '@/components/public/SyntheticDataBanner';
import { buildSchoolProfileData, getDummySchoolRecord } from '@/lib/public/schoolProfile';

export default async function SchoolProfilePage(props: {
  params: Promise<{ udise: string }>;
}) {
  const { udise } = await props.params;

  let name = '';
  let district = '';
  let block = '';
  let nameSynthetic = false;

  try {
    const school = await prisma.school.findUnique({
      where: { udise },
      include: { district: true, block: true },
    });

    if (school) {
      name = school.nameEn;
      district = school.district.nameEn;
      block = school.block.nameEn;
      nameSynthetic = school.nameSynthetic;
    }
  } catch {
    // fall through to dummy lookup
  }

  if (!name) {
    const dummy = getDummySchoolRecord(udise);
    if (!dummy) {
      notFound();
    }
    name = dummy.name;
    district = dummy.district;
    block = dummy.block;
    // Local dummy fixtures used during pre-seed dev are also synthetic.
    nameSynthetic = true;
  }

  const profile = buildSchoolProfileData({ udise, name, district, block });

  return (
    <>
      {nameSynthetic && (
        <div className="mx-auto max-w-6xl px-4 pt-6">
          <SyntheticDataBanner scope="profile" />
        </div>
      )}
      <SchoolProfileContent profile={profile} />
    </>
  );
}
