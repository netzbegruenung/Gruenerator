/**
 * Derives presentational format metadata for a gallery template.
 *
 * The Vorlagen API stores no explicit `aspectRatio`/format/tool columns — only
 * `template_type` (e.g. "sharepic", "story"), system file types ("header",
 * "hintergrund", "profilbild"), the `external_url` and free-form `tags`. This
 * helper is the single source of truth that turns those into the proportions,
 * format label and authoring tool the card UI needs, so every card renders its
 * format on a uniform neutral stage instead of letterboxed in grey margins.
 */

export interface TemplateFormat {
  /** CSS `aspect-ratio` value for the proportioned stage box, e.g. '1 / 1'. */
  aspectRatio: string;
  /** Compact ratio/size label shown in the meta row, e.g. '1:1', '9:16', 'A5'. */
  ratioLabel: string;
  /** Human format category shown as the stage badge, e.g. 'Sharepic', 'Story'. */
  typeLabel: string;
  /** Authoring tool / source, derived from the URL. */
  tool: 'Canva' | 'Download' | 'Link';
}

interface FormatSource {
  template_type?: string;
  tags?: string[];
  external_url?: string | null;
  download_url?: string;
  content_data?: { originalUrl?: string } | Record<string, unknown>;
}

interface FormatPreset {
  aspectRatio: string;
  ratioLabel: string;
  typeLabel: string;
}

// Known template/file types → proportions. Keys are the raw `template_type`
// (or system `file_type`) values returned by the gallery API.
const TYPE_PRESETS: Record<string, FormatPreset> = {
  sharepic: { aspectRatio: '1 / 1', ratioLabel: '1:1', typeLabel: 'Sharepic' },
  story: { aspectRatio: '9 / 16', ratioLabel: '9:16', typeLabel: 'Story' },
  reel: { aspectRatio: '9 / 16', ratioLabel: '9:16', typeLabel: 'Reel' },
  post: { aspectRatio: '4 / 5', ratioLabel: '4:5', typeLabel: 'Post' },
  flyer: { aspectRatio: '210 / 297', ratioLabel: 'A5', typeLabel: 'Flyer' },
  plakat: { aspectRatio: '210 / 297', ratioLabel: 'A-Format', typeLabel: 'Plakat' },
  header: { aspectRatio: '3 / 1', ratioLabel: 'Banner', typeLabel: 'Header' },
  hintergrund: { aspectRatio: '16 / 9', ratioLabel: '16:9', typeLabel: 'Hintergrund' },
  profilbild: { aspectRatio: '1 / 1', ratioLabel: '1:1', typeLabel: 'Profilbild' },
};

const DEFAULT_PRESET: FormatPreset = {
  aspectRatio: '1 / 1',
  ratioLabel: '1:1',
  typeLabel: 'Vorlage',
};

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Tag hints can override a type's default proportions (e.g. a "sharepic" tagged
// "hochformat" is portrait 4:5). Checked in order; first match wins.
const TAG_OVERRIDES: Array<{ match: string[]; aspectRatio: string; ratioLabel: string }> = [
  { match: ['9:16', 'hochkant', 'story'], aspectRatio: '9 / 16', ratioLabel: '9:16' },
  { match: ['4:5', 'hochformat', 'portrait'], aspectRatio: '4 / 5', ratioLabel: '4:5' },
  { match: ['16:9', 'querformat', 'landscape'], aspectRatio: '16 / 9', ratioLabel: '16:9' },
  { match: ['quadratisch', '1:1', 'square'], aspectRatio: '1 / 1', ratioLabel: '1:1' },
];

const deriveTool = (item: FormatSource): TemplateFormat['tool'] => {
  const url =
    (item.content_data as { originalUrl?: string } | undefined)?.originalUrl ||
    item.external_url ||
    '';
  if (url.includes('canva.com')) return 'Canva';
  if (item.download_url) return 'Download';
  return 'Link';
};

export const getTemplateFormat = (item: FormatSource): TemplateFormat => {
  const type = item.template_type?.toLowerCase() ?? '';
  const preset = TYPE_PRESETS[type] ?? {
    ...DEFAULT_PRESET,
    typeLabel: type ? capitalize(type) : DEFAULT_PRESET.typeLabel,
  };

  let { aspectRatio, ratioLabel } = preset;
  const tags = Array.isArray(item.tags) ? item.tags.map((t) => t.toLowerCase()) : [];
  for (const override of TAG_OVERRIDES) {
    if (override.match.some((m) => tags.includes(m))) {
      aspectRatio = override.aspectRatio;
      ratioLabel = override.ratioLabel;
      break;
    }
  }

  return { aspectRatio, ratioLabel, typeLabel: preset.typeLabel, tool: deriveTool(item) };
};
