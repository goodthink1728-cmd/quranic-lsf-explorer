/**
 * Quranic SFL Explorer - TypeScript Type Definitions (V6.0)
 * Mencakup korpus lengkap Al-Qur'an Kemenag RI (114 Surat, 6.236 Ayat),
 * Ebook LSF (Halliday 2004, Tesis Surat Ibrahim 2025, Kajian Al-Insan, Risalah LSF Arab),
 * serta Matriks Komparasi LSF vs. Metode Tafsir Klasik & Kontemporer.
 */

export type ProcessCategory =
  | "Material"
  | "Mental"
  | "Relational"
  | "Verbal"
  | "Behavioural"
  | "Existential";

export type SpeechFunctionCategory =
  | "Deklaratif"
  | "Imperatif"
  | "Interogatif"
  | "Doa";

export type ThemeCategory = "Unmarked" | "Marked" | "Multiple";

export interface KemenagAyah {
  n: number;
  ar: string;
  tr: string;
  id: string;
  au: string;
}

export interface KemenagSurah {
  nomor: number;
  nama: string;
  namaLatin: string;
  jumlahAyat: number;
  tempatTurun: "Mekah" | "Madinah" | string;
  arti: string;
  deskripsi: string;
  audioFull: string;
  ayat: KemenagAyah[];
}

export interface KemenagQuranCorpus {
  source: string;
  totalSurah: number;
  totalAyat: number;
  surahs: KemenagSurah[];
}

export interface MethodologyProfile {
  id: string;
  name: string;
  era: string;
  keyFigures: string;
  paradigm: string;
  unitOfAnalysis: string;
  strength: string;
  relationToLsf: string;
}

export interface TafsirComparison {
  kemenagSummary: string;
  klasikMatsur: string;
  lughawiBalaghi: string;
  kontemporerAdabi: string;
  kontemporerMaqashidi: string;
  lsfVsTafsirSynthesis: string;
}

export interface TaxonomyTerm {
  key: string;
  labelId: string;
  labelEn: string;
  labelAr: string;
  description: string;
  examples?: string[];
}

export interface EbookReference {
  id: string;
  title: string;
  author: string;
  year?: string | number;
  type: string;
  notes?: string;
}

export interface CorpusBenchmark {
  source: string;
  segment: string;
  totalClauses: number;
  distribution: Record<ProcessCategory | string, number>;
}

export interface DiagramSegment {
  ar: string;
  ide: string;
  ideAr?: string;
  int: string;
  intAr?: string;
  tex: string;
  texAr?: string;
  flex: string;
}

export interface SFLToken {
  ar: string;
  tr: string;
  root?: string;
  pos?: string;
  role: string;
  roleAr?: string;
}

export interface ClauseParticipant {
  roleEn: string;
  roleAr: string;
  text: string;
}

export interface ClauseCircumstance {
  typeEn: string;
  typeAr: string;
  text: string;
}

export interface SFLClause {
  clauseId: string;
  arabicText: string;
  transitivity: {
    process: {
      typeEn: ProcessCategory;
      typeAr: string;
      subtype?: string;
      lexicalVerb: string;
      root?: string;
    };
    participants: ClauseParticipant[];
    circumstances: ClauseCircumstance[];
  };
  interpersonal: {
    speechFunction: string;
    mood: string;
    moodAr?: string;
    modality?: string;
  };
  textual: {
    theme: string;
    rheme: string;
    themeType: ThemeCategory;
  };
}

export interface IdeationalRow {
  seg: string;
  comp: string;
  compAr?: string;
  role: string;
  desc: string;
}

export interface InterpersonalRow {
  seg: string;
  block: string;
  blockAr?: string;
  role: string;
  desc: string;
}

export interface NahwuBalaghahBridge {
  nahwu: string;
  balaghah: string;
  sflSynthesis: string;
}

export interface PedagogicalNote {
  targetLevel: string;
  learningObjective: string;
  qiraahActivity: string;
}

export interface VerseSFLAnalysis {
  surah: number;
  surahName?: string;
  verse: number;
  ref: string;
  sourceRef?: string;
  isDraftHeuristic?: boolean;
  arabic: string;
  translit: string;
  translation: string;
  processCategory: ProcessCategory;
  processCategoryAr?: string;
  speechCategory: SpeechFunctionCategory;
  themeCategory: ThemeCategory;
  clauses?: SFLClause[];
  diagramSegments: DiagramSegment[];
  tokens: SFLToken[];
  ideational: {
    processType: string;
    processTypeAr?: string;
    rows: IdeationalRow[];
    summary: string;
  };
  interpersonal: {
    speechFunc: string;
    speechFuncAr?: string;
    modality?: string;
    rows: InterpersonalRow[];
    summary: string;
  };
  textual: {
    themeType: string;
    themeTypeAr?: string;
    themeContent: string;
    themeDesc: string;
    rhemeContent: string;
    rhemeDesc: string;
    summary: string;
  };
  nahwuBalaghahBridge?: NahwuBalaghahBridge;
  pedagogicalNote?: PedagogicalNote;
  tafsirComparison?: TafsirComparison;
}

export interface QuranicSFLDataset {
  $schema?: string;
  schemaVersion: string;
  metadata: {
    title: string;
    description?: string;
    framework: string;
    language: string[];
    lastUpdated?: string;
    references: EbookReference[];
    corpusBenchmark?: CorpusBenchmark;
    methodologyMatrix?: MethodologyProfile[];
  };
  taxonomy: {
    metafunctions: TaxonomyTerm[];
    processes: TaxonomyTerm[];
    participants: TaxonomyTerm[];
    circumstances: TaxonomyTerm[];
  };
  verses: Record<string, VerseSFLAnalysis>;
}
