import type {
  RatingCategory,
  Recommendation,
} from '../../generated/prisma/client';

/**
 * The 13 rated aspects and 6 narrative blocks of the CPMI psychological report.
 * Keys are part of the stored JSON, so they are frozen: renaming one orphans
 * every report already saved. Labels are the Indonesian wording printed on the
 * template.
 */

/** Maximum length of one narrative block, measured against the template box. */
export const NARRATIVE_MAX_LENGTH = 800;

export interface RatingAspect {
  readonly key: string;
  readonly label: string;
  /** The URAIAN column of the template, verbatim. */
  readonly description: string;
}

export interface RatingSection {
  readonly id: string;
  readonly label: string;
  readonly aspects: readonly RatingAspect[];
}

export const RATING_SECTIONS: readonly RatingSection[] = [
  {
    id: 'intellectual',
    label: 'I. KEMAMPUAN INTELEKTUAL',
    aspects: [
      {
        key: 'intellectual.logic',
        label: 'Logika Berpikir',
        description: 'Kemampuan untuk berpikir secara logis dan sistematis.',
      },
      {
        key: 'intellectual.analysis',
        label: 'Daya Analisis',
        description:
          'Kemampuan untuk melihat permasalahan dan memahami hubungan sebab akibat permasalahan.',
      },
      {
        key: 'intellectual.numeric',
        label: 'Kemampuan Numerikal',
        description:
          'Kemampuan untuk berpikir praktis dalam memahami konsep angka dan hitungan.',
      },
      {
        key: 'intellectual.verbal',
        label: 'Kemampuan Verbal',
        description:
          'Kemampuan untuk memahami konsep dan pola dalam bentuk kata-kata dan mengekspresikan gagasan secara verbal.',
      },
    ],
  },
  {
    id: 'attitude',
    label: 'II. SIKAP DAN CARA KERJA',
    aspects: [
      {
        key: 'attitude.result',
        label: 'Orientasi Hasil',
        description:
          'Kemampuan untuk mempertahankan komitmen menyelesaikan tugas secara bertanggungjawab dan memperhatikan keterhubungan antara perencanaan dan hasil kerja.',
      },
      {
        key: 'attitude.flexibility',
        label: 'Fleksibilitas',
        description:
          'Kemampuan untuk menyesuaikan diri dalam menghadapi permasalahan.',
      },
      {
        key: 'attitude.systematic',
        label: 'Sistematika Kerja',
        description:
          'Kemampuan untuk merencanakan hingga mengorganisasikan cara kerja dalam proses penyelesaian pekerjaan.',
      },
    ],
  },
  {
    id: 'personality',
    label: 'III. KEPRIBADIAN',
    aspects: [
      {
        key: 'personality.motivation',
        label: 'Motivasi',
        description:
          'Kemampuan untuk menunjukkan prestasi dan mencapai target.',
      },
      {
        key: 'personality.cooperation',
        label: 'Kerjasama',
        description:
          'Kemampuan untuk menjalin, membina dan mengoptimalkan hubungan kerja yang efektif demi tercapainya tujuan bersama.',
      },
      {
        key: 'personality.interpersonal',
        label: 'Keterampilan Interpersonal',
        description:
          'Kemampuan untuk menjalin hubungan sosial dan mampu memahami kebutuhan orang lain.',
      },
      {
        key: 'personality.emotion',
        label: 'Stabilitas Emosi',
        description: 'Kemampuan untuk memahami dan mengontrol emosi.',
      },
    ],
  },
  {
    id: 'learning',
    label: 'IV. KEMAMPUAN BELAJAR',
    aspects: [
      {
        key: 'learning.change',
        label: 'Mengelola Perubahan',
        description:
          'Kemampuan dalam menyesuaikan diri dengan situasi yang baru.',
      },
      {
        key: 'learning.development',
        label: 'Pengembangan Diri',
        description:
          'Kemampuan meningkatkan pengetahuan dan penyempurnaan keterampilan diri.',
      },
    ],
  },
];

export interface NarrativeField {
  readonly key: string;
  readonly label: string;
  /** Page of the 4-page template the block is printed on. */
  readonly page: 2 | 3 | 4;
}

export const NARRATIVE_FIELDS: readonly NarrativeField[] = [
  { key: 'conclusion.intellectual', label: 'Kesimpulan I', page: 2 },
  { key: 'conclusion.attitude', label: 'Kesimpulan II', page: 3 },
  { key: 'conclusion.personality', label: 'Kesimpulan III', page: 3 },
  { key: 'conclusion.learning', label: 'Kesimpulan IV', page: 4 },
  { key: 'development', label: 'Saran Pengembangan', page: 4 },
  { key: 'overall', label: 'Kesimpulan Umum', page: 4 },
];

export const RATING_KEYS: readonly string[] = RATING_SECTIONS.flatMap(
  (section) => section.aspects.map((aspect) => aspect.key),
);

export const NARRATIVE_KEYS: readonly string[] = NARRATIVE_FIELDS.map(
  (field) => field.key,
);

/**
 * `satisfies` keeps these literals in lockstep with the Prisma enums: if the
 * database enum gains or loses a value, this file stops compiling.
 */
export const RATING_VALUES = [
  'R',
  'K',
  'C',
  'B',
  'T',
] as const satisfies readonly RatingCategory[];

export const RECOMMENDATION_VALUES = [
  'LAYAK',
  'BELUM_LAYAK',
  'TIDAK_LAYAK',
] as const satisfies readonly Recommendation[];

export const RATING_LABELS: Readonly<Record<string, string>> = {
  R: 'Rendah',
  K: 'Kurang',
  C: 'Cukup',
  B: 'Baik',
  T: 'Tinggi',
};
