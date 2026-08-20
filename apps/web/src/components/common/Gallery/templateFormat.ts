/**
 * Derives presentational format metadata for a gallery template.
 *
 * The Vorlagen API stores no explicit format/tool columns — only
 * `template_type` (e.g. "sharepic", "story"), system file types ("header",
 * "hintergrund", "profilbild"), the `external_url` and free-form `tags`. This
 * helper is the single source of truth that turns those into the meta line and
 * authoring tool the card UI shows below each thumbnail.
 */

export interface TemplateFormat {
  /** Meta line under the title, e.g. 'Sharepic · 1:1' — or just '1:1' when the type is generic. */
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

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

// Tag hints can override a type's default ratio (e.g. a "sharepic" tagged
// "hochformat" is portrait 4:5). Checked in order; first match wins.
const TAG_OVERRIDES: Array<{ match: string[]; ratioLabel: string }> = [
  { match: ['9:16', 'hochkant', 'story'], ratioLabel: '9:16' },
  { match: ['4:5', 'hochformat', 'portrait'], ratioLabel: '4:5' },
  { match: ['16:9', 'querformat', 'landscape'], ratioLabel: '16:9' },
  { match: ['quadratisch', '1:1', 'square'], ratioLabel: '1:1' },
];

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

export const getTemplateFormat = (item: FormatSource): TemplateFormat => {
  const type = item.template_type?.toLowerCase() ?? '';
  const preset = TYPE_PRESETS[type] ?? {
    ...DEFAULT_PRESET,
    typeLabel: type ? capitalize(type) : DEFAULT_PRESET.typeLabel,
  };

  let { ratioLabel } = preset;
  const tags = Array.isArray(item.tags) ? item.tags.map((t) => t.toLowerCase()) : [];
  for (const override of TAG_OVERRIDES) {
    if (override.match.some((m) => tags.includes(m))) {
      ratioLabel = override.ratioLabel;
      break;
    }
  }

  // "Vorlage · 1:1" would say nothing — drop the generic type from the line.
  const isGenericType = preset.typeLabel === DEFAULT_PRESET.typeLabel;
  const formatLabel = isGenericType ? ratioLabel : `${preset.typeLabel} · ${ratioLabel}`;

  return { formatLabel, tool: deriveTool(item) };
};
