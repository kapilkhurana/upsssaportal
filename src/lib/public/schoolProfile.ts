import { SCHOOLS, type SchoolRecord } from '@/lib/public/dummyData';
import type { PerformanceLevel, SchoolType } from '@/lib/public/constants';
import { PERFORMANCE_COLORS } from '@/lib/public/constants';

export const UP_SQAAF_DOMAINS = [
  {
    id: 'infra',
    name: 'Infrastructure & Safety of Students',
    weightage: 20,
  },
  {
    id: 'admin',
    name: 'Administration — Human Resources & Leadership',
    weightage: 20,
  },
  {
    id: 'pedagogy',
    name: 'Teaching & Learning Pedagogy — Curriculum Transaction',
    weightage: 20,
  },
  {
    id: 'assessment',
    name: 'Assessment — Learning Outcomes',
    weightage: 20,
  },
  {
    id: 'inclusive',
    name: 'Inclusiveness — Student Well-being and Community Participation',
    weightage: 20,
  },
] as const;

export type AccreditationStatus = 'SQAAF Verified' | 'Pending';

export function scoreToLevel(score: number): PerformanceLevel {
  if (score < 50) return 'Uday';
  if (score <= 75) return 'Unnat';
  return 'Utkarsh';
}

export function levelDescription(level: PerformanceLevel): string {
  switch (level) {
    case 'Uday':
      return 'School is at the foundational level and requires focused improvement across key domains.';
    case 'Unnat':
      return 'School demonstrates steady progress with scope for strengthening teaching and infrastructure.';
    case 'Utkarsh':
      return 'School shows strong performance aligned with UP-SQAAF excellence benchmarks.';
  }
}

function hashUdise(udise: string): number {
  let h = 0;
  for (let i = 0; i < udise.length; i++) {
    h = (h * 31 + udise.charCodeAt(i)) % 9973;
  }
  return h;
}

export function getDummySchoolRecord(udise: string): SchoolRecord | null {
  return SCHOOLS.find((s) => s.udise === udise) ?? null;
}

export function deriveResultFields(udise: string): {
  type: SchoolType;
  performanceLevel: PerformanceLevel;
  feeDisclosed: boolean;
  accreditation: AccreditationStatus;
  overallScore: number;
} {
  const match = getDummySchoolRecord(udise);
  if (match) {
    return {
      type: match.type,
      performanceLevel: match.performanceLevel,
      feeDisclosed: match.feeDisclosed,
      accreditation: match.accreditation,
      overallScore: match.overallScore,
    };
  }
  const h = hashUdise(udise);
  const types: SchoolType[] = ['Government', 'Aided', 'Private'];
  const score = 35 + (h % 46);
  return {
    type: types[h % 3],
    performanceLevel: scoreToLevel(score),
    feeDisclosed: h % 2 === 0,
    accreditation: h % 3 === 0 ? 'SQAAF Verified' : 'Pending',
    overallScore: score,
  };
}

export type SchoolProfileBase = {
  udise: string;
  name: string;
  district: string;
  block: string;
};

export type SchoolProfileData = SchoolProfileBase & {
  type: SchoolType;
  performanceLevel: PerformanceLevel;
  overallScore: number;
  feeDisclosed: boolean;
  accreditation: AccreditationStatus;
  recognition: string;
  board: string;
  classes: string;
  overview: {
    totalStudents: number;
    totalTeachers: number;
    pupilTeacherRatio: string;
    totalClassrooms: number;
    nonTeachingStaff: number;
    subjectTeachers: number;
    functionalToilets: number;
    drinkingWater: 'Available' | 'Not Available';
    enrolment: {
      primary: number;
      upperPrimary: number;
      secondary: number;
      higherSecondary: number;
      boys: number;
      girls: number;
      sc: number;
      st: number;
      obc: number;
      general: number;
    };
    dropout: { primary: number; upperPrimary: number; secondary: number };
    studentAttendance: { primary: number; upperPrimary: number; secondary: number };
    teacherAttendance: { primary: number; upperPrimary: number; secondary: number };
    infrastructureTags: string[];
    safetyChecks: { label: string; done: boolean; date?: string }[];
  };
  performance: {
    stateAverage: number;
    districtAverage: number;
    topScore: number;
    domains: {
      id: string;
      name: string;
      weightage: number;
      ourScore: number;
      topScore: number;
      level: PerformanceLevel;
      subDomains: { name: string; score: number }[];
    }[];
  };
  fees: {
    annualTuition: string;
    admissionFee: string;
    transportFee: string;
    otherCharges: string;
    scholarshipsAvailable: string;
    lastUpdated: string;
    scholarships: string[];
  };
  reportCard: {
    strengths: string[];
    improvements: string[];
    domainScores: { name: string; score: number }[];
    learningOutcomes: {
      grade: string;
      subjects: { name: string; pct: number; stateAvg: number }[];
    }[];
  };
};

// NOTE: the fields below (scores, attendance, enrolment splits, infrastructure
// tags, learning outcomes, dropout rates, fees) are *derived* from a hash of
// the UDISE because the Prisma School model does not yet carry them. The full
// UP school CSV does carry many of them (enr_*, *_lab_cond, total_tch, …) —
// once the schema is extended with the corresponding columns, replace these
// derivations with real DB reads. Until then they remain synthetic stand-ins.
export function buildSchoolProfileData(base: SchoolProfileBase): SchoolProfileData {
  const dummy = getDummySchoolRecord(base.udise);
  const derived = deriveResultFields(base.udise);
  const h = hashUdise(base.udise);
  const score = dummy?.overallScore ?? derived.overallScore;
  const level = dummy?.performanceLevel ?? derived.performanceLevel;
  const students = dummy?.students ?? 400 + (h % 900);
  const teachers = dummy?.teachers ?? 12 + (h % 40);

  const domainScores = UP_SQAAF_DOMAINS.map((d, i) => {
    const ourScore = Math.min(95, Math.max(28, score - 8 + ((h + i * 7) % 18)));
    const topScore = Math.min(98, ourScore + 12 + (i % 5));
    return {
      id: d.id,
      name: d.name,
      weightage: d.weightage,
      ourScore,
      topScore,
      level: scoreToLevel(ourScore),
      subDomains: [
        { name: 'Indicator A', score: ourScore - 3 },
        { name: 'Indicator B', score: ourScore + 2 },
        { name: 'Indicator C', score: ourScore - 1 },
      ],
    };
  });

  const boys = Math.floor(students * 0.52);
  const girls = students - boys;

  return {
    ...base,
    type: dummy?.type ?? derived.type,
    performanceLevel: level,
    overallScore: score,
    feeDisclosed: dummy?.feeDisclosed ?? derived.feeDisclosed,
    accreditation: dummy?.accreditation ?? derived.accreditation,
    recognition: 'Recognized',
    board: derived.type === 'Private' ? 'CBSE' : 'UP Board',
    classes: dummy?.level ?? 'Primary to Secondary',
    overview: {
      totalStudents: students,
      totalTeachers: teachers,
      pupilTeacherRatio: `${(students / teachers).toFixed(1)}:1`,
      totalClassrooms: Math.ceil(students / 40),
      nonTeachingStaff: 4 + (h % 8),
      subjectTeachers: Math.floor(teachers * 0.7),
      functionalToilets: 6 + (h % 10),
      drinkingWater: h % 5 === 0 ? 'Not Available' : 'Available',
      enrolment: {
        primary: Math.floor(students * 0.35),
        upperPrimary: Math.floor(students * 0.25),
        secondary: Math.floor(students * 0.22),
        higherSecondary: Math.floor(students * 0.18),
        boys,
        girls,
        sc: Math.floor(students * 0.18),
        st: Math.floor(students * 0.08),
        obc: Math.floor(students * 0.32),
        general: students - Math.floor(students * 0.58),
      },
      dropout: {
        primary: 1.2 + (h % 3) * 0.3,
        upperPrimary: 2.1 + (h % 2) * 0.4,
        secondary: 3.4 + (h % 4) * 0.2,
      },
      studentAttendance: {
        primary: 88 + (h % 4),
        upperPrimary: 86 + (h % 5),
        secondary: 85 + (h % 3),
      },
      teacherAttendance: {
        primary: 94 + (h % 3),
        upperPrimary: 92 + (h % 4),
        secondary: 91 + (h % 5),
      },
      infrastructureTags: ['Library', 'Science Lab', 'Computer Lab', 'Playground'],
      safetyChecks: [
        { label: 'Functional Toilets (Separate)', done: true, date: '15 Jan 2025' },
        { label: 'Safe Drinking Water Certification', done: true, date: '02 Mar 2025' },
        { label: 'Medical Room', done: h % 2 === 0, date: h % 2 === 0 ? '10 Nov 2024' : undefined },
        { label: 'Secure School Premises (Boundary Wall + CCTV)', done: true, date: '20 Aug 2024' },
        { label: 'Fire Safety Certificate', done: true, date: '05 Jun 2025' },
        { label: 'Building Safety Certificate', done: h % 3 !== 0, date: h % 3 !== 0 ? '18 Apr 2025' : undefined },
      ],
    },
    performance: {
      stateAverage: 54,
      districtAverage: 52 + (h % 8),
      topScore: 88,
      domains: domainScores,
    },
    fees: {
      annualTuition: derived.type === 'Government' ? '₹0 (Government)' : `₹${(8000 + (h % 12) * 1500).toLocaleString('en-IN')}`,
      admissionFee: `₹${(500 + (h % 5) * 200).toLocaleString('en-IN')}`,
      transportFee: `₹${(1200 + (h % 6) * 300).toLocaleString('en-IN')} / year`,
      otherCharges: `₹${(800 + (h % 4) * 250).toLocaleString('en-IN')}`,
      scholarshipsAvailable: dummy?.feeDisclosed ? 'Yes' : 'Limited',
      lastUpdated: 'March 2025',
      scholarships: ['Merit Scholarship', 'Economically Weaker Section', 'Sports Quota'],
    },
    reportCard: {
      strengths: [
        UP_SQAAF_DOMAINS[2].name,
        UP_SQAAF_DOMAINS[0].name,
        UP_SQAAF_DOMAINS[3].name,
      ],
      improvements: [
        UP_SQAAF_DOMAINS[1].name,
        UP_SQAAF_DOMAINS[4].name,
        UP_SQAAF_DOMAINS[0].name,
      ],
      domainScores: domainScores.map((d) => ({ name: d.name, score: d.ourScore })),
      learningOutcomes: [
        {
          grade: 'Grade 3',
          subjects: [
            { name: 'Language', pct: 72, stateAvg: 65 },
            { name: 'Mathematics', pct: 68, stateAvg: 62 },
          ],
        },
        {
          grade: 'Grade 5',
          subjects: [
            { name: 'Language', pct: 74, stateAvg: 66 },
            { name: 'Mathematics', pct: 70, stateAvg: 63 },
          ],
        },
        {
          grade: 'Grade 8',
          subjects: [
            { name: 'Science', pct: 71, stateAvg: 64 },
            { name: 'Social Science', pct: 69, stateAvg: 61 },
          ],
        },
        {
          grade: 'Grade 10',
          subjects: [
            { name: 'Mathematics', pct: 76, stateAvg: 68 },
            { name: 'Science', pct: 73, stateAvg: 65 },
          ],
        },
        {
          grade: 'Grade 12',
          subjects: [
            { name: 'Physics', pct: 78, stateAvg: 70 },
            { name: 'Chemistry', pct: 75, stateAvg: 68 },
          ],
        },
      ],
    },
  };
}

export { PERFORMANCE_COLORS };

export const DIRECTORY_LEVEL_BADGE: Record<PerformanceLevel, string> = {
  Uday: 'bg-[#FCE7F3] text-pink-800',
  Unnat: 'bg-[#FEF9C3] text-yellow-800',
  Utkarsh: 'bg-[#DCFCE7] text-green-800',
};
