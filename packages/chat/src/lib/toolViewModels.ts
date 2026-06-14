// Platform-neutral view-models for finished chat tool calls.
//
// One Zod discriminated union describes everything a tool result can render
// as. `toolRegistry.ts` maps tool names to parsers producing these VMs; each
// platform supplies only a `kind → component` mapping (web: CitationList /
// LinkPreview / …, mobile: ToolCitationList / ScrapeUrlCard / …).
// Like toolResults.ts this module is Metro-safe: zod only, no react/DOM.

import { z } from 'zod';

import { SerializableCitationSchema } from '../components/tool-ui/citation/schema';

export const TOOL_VIEW_KINDS = [
  'citations',
  'link-preview',
  'markdown-report',
  'snippets',
  'press-examples',
  'person',
  'image',
  'text-note',
  'key-value',
  'interactive',
] as const;

export const ToolViewKindSchema = z.enum(TOOL_VIEW_KINDS);
export type ToolViewKind = z.infer<typeof ToolViewKindSchema>;

// ---------------------------------------------------------------------------
// Leaf shapes. These are the type source for the parser outputs in
// toolResults.ts (which re-exports the inferred types) — never re-declare
// them as interfaces.
// ---------------------------------------------------------------------------

export const ResearchCitationSchema = z.object({
  id: z.number(),
  title: z.string(),
  url: z.string(),
  domain: z.string(),
  snippet: z.string(),
});
export type ResearchCitation = z.infer<typeof ResearchCitationSchema>;

export const ResearchSearchStepSchema = z.object({
  tool: z.string(),
  query: z.string(),
  resultsCount: z.number(),
});
export type ResearchSearchStep = z.infer<typeof ResearchSearchStepSchema>;

export const ExampleSnippetSchema = z.object({
  platform: z.string().nullable(),
  content: z.string().nullable(),
});
export type ExampleSnippet = z.infer<typeof ExampleSnippetSchema>;

export const PressemitteilungExampleSchema = z.object({
  id: z.string(),
  title: z.string(),
  body: z.string(),
  lv: z.string(),
  publishedAt: z.string().nullable(),
  url: z.string().nullable(),
});
export type PressemitteilungExample = z.infer<typeof PressemitteilungExampleSchema>;

export const KeyValueEntrySchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type KeyValueEntry = z.infer<typeof KeyValueEntrySchema>;

// ---------------------------------------------------------------------------
// VM union members.
// ---------------------------------------------------------------------------

export const CitationListVMSchema = z.object({
  kind: z.literal('citations'),
  citations: z.array(SerializableCitationSchema),
});
export type CitationListVM = z.infer<typeof CitationListVMSchema>;

export const LinkPreviewVMSchema = z.object({
  kind: z.literal('link-preview'),
  href: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  domain: z.string().nullable(),
  favicon: z.string().nullable(),
});
export type LinkPreviewVM = z.infer<typeof LinkPreviewVMSchema>;

export const MarkdownReportVMSchema = z.object({
  kind: z.literal('markdown-report'),
  answer: z.string().nullable(),
  citations: z.array(ResearchCitationSchema),
  /** Tolerant: backend sends 'high' | 'medium' | 'low', but unknown values must still render. */
  confidence: z.string().nullable(),
  followUpQuestions: z.array(z.string()),
  searchStepsCount: z.number(),
  stepsList: z.array(ResearchSearchStepSchema),
});
export type MarkdownReportVM = z.infer<typeof MarkdownReportVMSchema>;

export const SnippetListVMSchema = z.object({
  kind: z.literal('snippets'),
  items: z.array(ExampleSnippetSchema),
});
export type SnippetListVM = z.infer<typeof SnippetListVMSchema>;

export const PressExamplesVMSchema = z.object({
  kind: z.literal('press-examples'),
  examples: z.array(PressemitteilungExampleSchema),
  message: z.string().nullable(),
});
export type PressExamplesVM = z.infer<typeof PressExamplesVMSchema>;

export const PersonVMSchema = z.object({
  kind: z.literal('person'),
  found: z.boolean(),
  name: z.string().nullable(),
  fraktion: z.string().nullable(),
  wahlkreis: z.string().nullable(),
});
export type PersonVM = z.infer<typeof PersonVMSchema>;

export const ImageResultVMSchema = z.object({
  kind: z.literal('image'),
  url: z.string(),
  prompt: z.string().nullable(),
  alt: z.string().nullable(),
});
export type ImageResultVM = z.infer<typeof ImageResultVMSchema>;

export const TextNoteVMSchema = z.object({
  kind: z.literal('text-note'),
  text: z.string(),
});
export type TextNoteVM = z.infer<typeof TextNoteVMSchema>;

export const KeyValueVMSchema = z.object({
  kind: z.literal('key-value'),
  entries: z.array(KeyValueEntrySchema),
  citations: z.array(SerializableCitationSchema),
  markdown: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type KeyValueVM = z.infer<typeof KeyValueVMSchema>;

/**
 * ask_human: each platform renders its own interactive component (the
 * `addResult` wiring differs between @assistant-ui/react's Toolkit and
 * @assistant-ui/react-native's tools.Fallback), so the VM carries nothing.
 */
export const InteractiveVMSchema = z.object({
  kind: z.literal('interactive'),
});
export type InteractiveVM = z.infer<typeof InteractiveVMSchema>;

export const ToolResultVMSchema = z.discriminatedUnion('kind', [
  CitationListVMSchema,
  LinkPreviewVMSchema,
  MarkdownReportVMSchema,
  SnippetListVMSchema,
  PressExamplesVMSchema,
  PersonVMSchema,
  ImageResultVMSchema,
  TextNoteVMSchema,
  KeyValueVMSchema,
  InteractiveVMSchema,
]);
export type ToolResultVM = z.infer<typeof ToolResultVMSchema>;
