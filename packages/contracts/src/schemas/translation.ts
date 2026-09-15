/**
 * Zod schemas for the DeepL translator (`/api/translation`).
 *
 * Text translation, languages, document-job status and the admin glossary are
 * ts-rest contracted. The document UPLOAD and the result DOWNLOAD are raw
 * Express routes beside the contract (the repo's multipart convention —
 * `@ts-rest/express` has no multipart handling); their text fields and JSON
 * responses still derive from the schemas here so web and mobile share one
 * shape.
 *
 * No Node-only types in here: `apps/mobile` bundles the contracts client.
 */
import { z } from 'zod';

export const translationFormalitySchema = z.enum(['default', 'more', 'less']);

export const translationLanguageSchema = z.object({
  /** BCP 47 as DeepL reports it, e.g. `de`, `en-GB`. */
  code: z.string(),
  name: z.string(),
  usableAsSource: z.boolean(),
  usableAsTarget: z.boolean(),
  /** Target supports the Sie/du formality switch. */
  formality: z.boolean(),
  /** Language can take part in a glossary dictionary. */
  glossary: z.boolean(),
});

export const translationQuotaSchema = z.object({
  used: z.number(),
  limit: z.number(),
});

export const translationLanguagesResponseSchema = z.object({
  languages: z.array(translationLanguageSchema),
  /** Root-language pairs the account glossary covers, e.g. `de>en`. */
  glossaryPairs: z.array(z.string()),
  quota: translationQuotaSchema,
});

/** Comfortably under DeepL's 128 KiB request limit even for multi-byte text. */
export const TRANSLATION_TEXT_MAX_CHARS = 50_000;

const langCode = z.string().min(2).max(10);

export const translateTextBodySchema = z.object({
  text: z.string().min(1).max(TRANSLATION_TEXT_MAX_CHARS),
  targetLang: langCode,
  /** Omit, `null` or `'auto'` → DeepL detects the source. */
  sourceLang: langCode.nullish(),
  formality: translationFormalitySchema.nullish(),
});

export const translateTextResponseSchema = z.object({
  text: z.string(),
  /** Root language DeepL detected (or the explicit source), lower-case. */
  detectedSourceLang: z.string(),
  targetLang: z.string(),
  billedCharacters: z.number(),
  glossaryApplied: z.boolean(),
  quota: translationQuotaSchema,
});

export const translationErrorSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  quota: translationQuotaSchema.nullish(),
});

// ── Documents ────────────────────────────────────────────────────────────

/** DeepL's supported input formats for `/v2/document`. */
export const TRANSLATION_DOCUMENT_EXTENSIONS = [
  'docx',
  'pptx',
  'xlsx',
  'pdf',
  'htm',
  'html',
  'txt',
  'xlf',
  'xliff',
  'srt',
  'idml',
  'xml',
  'json',
  'dita',
  'mif',
  'jpeg',
  'jpg',
  'png',
] as const;

export type TranslationDocumentExtension = (typeof TRANSLATION_DOCUMENT_EXTENSIONS)[number];

export const TRANSLATION_DOCUMENT_MAX_BYTES = 30 * 1024 * 1024;

/** Text fields sent beside the file in the multipart upload. */
export const translationDocumentUploadFieldsSchema = z.object({
  targetLang: langCode,
  sourceLang: langCode.nullish(),
  formality: translationFormalitySchema.nullish(),
  /** Only meaningful for PDF input: ask DeepL for an editable Word file. */
  outputFormat: z.enum(['docx']).nullish(),
});

export const translationDocumentUploadResponseSchema = z.object({
  jobId: z.string(),
  /** Name the translated file will download as. */
  filename: z.string(),
});

export const translationDocumentStatusSchema = z.enum(['queued', 'translating', 'done', 'error']);

export const translationDocumentStatusResponseSchema = z.object({
  jobId: z.string(),
  status: translationDocumentStatusSchema,
  secondsRemaining: z.number().nullable(),
  billedCharacters: z.number().nullable(),
  message: z.string().nullable(),
  filename: z.string(),
});

// ── Glossary (admin) ─────────────────────────────────────────────────────

const GLOSSARY_TERM_MAX_BYTES = 1024;
const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

const glossaryTerm = z
  .string()
  .trim()
  .min(1, 'Ein Begriff darf nicht leer sein.')
  .refine(
    (s) => !/[\t\r\n]/.test(s),
    'Begriffe dürfen keine Tabulatoren oder Zeilenumbrüche enthalten.'
  )
  .refine(
    (s) => utf8Bytes(s) <= GLOSSARY_TERM_MAX_BYTES,
    'Ein Begriff darf höchstens 1024 Bytes lang sein.'
  );

export const glossaryEntrySchema = z.object({
  source: glossaryTerm,
  target: glossaryTerm,
});

/** Root language, e.g. `de`, `en` — glossaries never carry a region. */
const glossaryLang = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z]{2,3}$/, 'Sprachcode ohne Region, z. B. „de" oder „en".');

export const glossaryDictionarySchema = z.object({
  sourceLang: glossaryLang,
  targetLang: glossaryLang,
  entries: z.array(glossaryEntrySchema),
});

export const glossaryResponseSchema = z.object({
  glossaryId: z.string().nullable(),
  name: z.string(),
  dictionaries: z.array(glossaryDictionarySchema),
});

export const glossaryDictionaryPutSchema = z
  .object({
    sourceLang: glossaryLang,
    targetLang: glossaryLang,
    entries: z.array(glossaryEntrySchema).min(1).max(5000),
  })
  .refine((d) => d.sourceLang !== d.targetLang, {
    message: 'Quell- und Zielsprache müssen sich unterscheiden.',
    path: ['targetLang'],
  })
  .refine((d) => new Set(d.entries.map((e) => e.source.toLowerCase())).size === d.entries.length, {
    message: 'Jeder Quellbegriff darf nur einmal vorkommen.',
    path: ['entries'],
  });

export const glossaryDictionaryQuerySchema = z.object({
  sourceLang: glossaryLang,
  targetLang: glossaryLang,
});

export type TranslationFormality = z.infer<typeof translationFormalitySchema>;
export type TranslationLanguage = z.infer<typeof translationLanguageSchema>;
export type TranslationQuota = z.infer<typeof translationQuotaSchema>;
export type TranslationLanguagesResponse = z.infer<typeof translationLanguagesResponseSchema>;
export type TranslateTextBody = z.infer<typeof translateTextBodySchema>;
export type TranslateTextResponse = z.infer<typeof translateTextResponseSchema>;
export type TranslationError = z.infer<typeof translationErrorSchema>;
export type TranslationDocumentUploadFields = z.infer<typeof translationDocumentUploadFieldsSchema>;
export type TranslationDocumentUploadResponse = z.infer<
  typeof translationDocumentUploadResponseSchema
>;
export type TranslationDocumentStatus = z.infer<typeof translationDocumentStatusSchema>;
export type TranslationDocumentStatusResponse = z.infer<
  typeof translationDocumentStatusResponseSchema
>;
export type GlossaryEntry = z.infer<typeof glossaryEntrySchema>;
export type GlossaryDictionary = z.infer<typeof glossaryDictionarySchema>;
export type GlossaryResponse = z.infer<typeof glossaryResponseSchema>;
export type GlossaryDictionaryPut = z.infer<typeof glossaryDictionaryPutSchema>;
