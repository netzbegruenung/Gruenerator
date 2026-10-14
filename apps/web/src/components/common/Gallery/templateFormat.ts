/**
 * Derives presentational format metadata for a gallery template.
 *
 * The Vorlagen API stores no explicit format/tool columns — only
 * `template_type` (e.g. "sharepic", "story"), system file types ("header",
 * "hintergrund", "profilbild"), the `external_url` and free-form `tags`. This
 * helper is the single source of truth that turns those into the meta line and
 * authoring tool the card UI shows below each thumbnail.
 */

import { getCanvasFormat } from '@gruenerator/canvas-editor/formats';

export interface TemplateFormat {
  /** Meta line under the title, e.g. 'Sharepic · 1:1' — nur '1:1', wenn der Typ nichts Eigenes sagt. */
  formatLabel: string;
  /** Authoring tool / source, derived from the URL. */
  tool: 'Canva' | 'Grünerator' | 'Download' | 'Link';
}

interface FormatSource {
  template_type?: string;
  tags?: string[];
  external_url?: string | null;
  download_url?: string;
  content_data?: { originalUrl?: string } | Record<string, unknown>;
}

interface FormatPreset {
  ratioLabel: string;
  typeLabel: string;
}

// Known template/file types → ratio + label. Keys are the raw `template_type`
// (or system `file_type`) values returned by the gallery API.
const TYPE_PRESETS: Record<string, FormatPreset> = {
  sharepic: { ratioLabel: '1:1', typeLabel: 'Sharepic' },
  story: { ratioLabel: '9:16', typeLabel: 'Story' },
  reel: { ratioLabel: '9:16', typeLabel: 'Reel' },
  post: { ratioLabel: '4:5', typeLabel: 'Post' },
  flyer: { ratioLabel: 'A5', typeLabel: 'Flyer' },
  plakat: { ratioLabel: 'A-Format', typeLabel: 'Plakat' },
  header: { ratioLabel: 'Banner', typeLabel: 'Header' },
  hintergrund: { ratioLabel: '16:9', typeLabel: 'Hintergrund' },
  profilbild: { ratioLabel: '1:1', typeLabel: 'Profilbild' },
  // Native Grünerator sharepic templates default to the post-portrait ratio.
  gruenerator: { ratioLabel: '4:5', typeLabel: 'Sharepic' },
};

const DEFAULT_PRESET: FormatPreset = {
  ratioLabel: '1:1',
  typeLabel: 'Vorlage',
};

const MEASURED_RATIOS: Array<{ label: string; ratio: number }> = [
  { label: '9:16', ratio: 9 / 16 },
  { label: '3:4', ratio: 3 / 4 },
  { label: '4:5', ratio: 4 / 5 },
  { label: '1:1', ratio: 1 },
  { label: '4:3', ratio: 4 / 3 },
  { label: '16:9', ratio: 16 / 9 },
];

/** Nächstes Standardformat zu den echten Bildmaßen — im Zweifel das gerundete Verhältnis. */
export const ratioLabelFromSize = (width: number, height: number): string | null => {
  if (!(width > 0 && height > 0)) return null;
  const ratio = width / height;
  const nearest = MEASURED_RATIOS.reduce((best, r) =>
    Math.abs(Math.log(r.ratio / ratio)) < Math.abs(Math.log(best.ratio / ratio)) ? r : best
  );
  return Math.abs(Math.log(nearest.ratio / ratio)) < 0.06
    ? nearest.label
    : `${Math.round(ratio * 100) / 100}:1`;
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Tag hints can override a type's default ratio (e.g. a "sharepic" tagged
// "hochformat" is portrait 4:5). Checked in order; first match wins.
const TAG_OVERRIDES: Array<{ match: string[]; ratioLabel: string }> = [
  { match: ['9:16', 'hochkant', 'story'], ratioLabel: '9:16' },
  { match: ['4:5', 'hochformat', 'portrait'], ratioLabel: '4:5' },
  { match: ['16:9', 'querformat', 'landscape'], ratioLabel: '16:9' },
  { match: ['quadratisch', '1:1', 'square'], ratioLabel: '1:1' },
];

const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a);

/** A native Vorlage carries its canvas format in the blueprint, e.g. 3:4. */
const blueprintRatio = (item: FormatSource): string | null => {
  if (item.template_type !== 'gruenerator') return null;
  const id = (item.content_data as { format?: unknown } | undefined)?.format;
  const format = typeof id === 'string' ? getCanvasFormat(id) : null;
  if (!format) return null;
  const d = gcd(format.width, format.height);
  return `${format.width / d}:${format.height / d}`;
};

const deriveTool = (item: FormatSource): TemplateFormat['tool'] => {
  // Native Grünerator-Vorlagen open in the in-app editor — not an external tool.
  if (item.template_type === 'gruenerator') return 'Grünerator';

  const url =
    (item.content_data as { originalUrl?: string } | undefined)?.originalUrl ||
    item.external_url ||
    '';

  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname === 'canva.com' || hostname.endsWith('.canva.com')) return 'Canva';
  } catch {
    // Ignore invalid/relative URLs and fall through to existing fallback logic.
  }

  if (item.download_url) return 'Download';
  return 'Link';
};

export const getTemplateFormat = (
  item: FormatSource,
  measuredRatio?: string | null
): TemplateFormat => {
  const type = item.template_type?.toLowerCase() ?? '';
  const preset = TYPE_PRESETS[type] ?? {
    ...DEFAULT_PRESET,
    typeLabel: type ? capitalize(type) : DEFAULT_PRESET.typeLabel,
  };

  let { ratioLabel } = preset;
  let guessed = !TYPE_PRESETS[type];
  const tags = Array.isArray(item.tags) ? item.tags.map((t) => t.toLowerCase()) : [];
  for (const override of TAG_OVERRIDES) {
    if (override.match.some((m) => tags.includes(m))) {
      ratioLabel = override.ratioLabel;
      guessed = false;
      break;
    }
  }
  const blueprint = blueprintRatio(item);
  if (blueprint) {
    ratioLabel = blueprint;
    guessed = false;
  }

  // Gemessen wird nur, wo wir sonst raten müssten: kein bekannter Typ, kein Tag.
  if (guessed && measuredRatio) ratioLabel = measuredRatio;

  const tool = deriveTool(item);
  // Der Typ kommt nur dazu, wenn er etwas Eigenes sagt. Für die Gallerie-Mehrheit
  // IST `template_type` die Quelle ("canva"), nicht das Format — dann stünde neben
  // dem CANVA-Abzeichen noch einmal "Canva · 1:1". Und "Vorlage · 1:1" sagt nichts.
  const isGenericType = preset.typeLabel === DEFAULT_PRESET.typeLabel;
  const repeatsTool = preset.typeLabel.toLowerCase() === tool.toLowerCase();
  const formatLabel =
    isGenericType || repeatsTool ? ratioLabel : `${preset.typeLabel} · ${ratioLabel}`;

  return { formatLabel, tool };
};
