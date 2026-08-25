import { type IconType } from 'react-icons';
import {
  SiAirtable,
  SiAsana,
  SiAtlassian,
  SiBookingdotcom,
  SiBrevo,
  SiCalendly,
  SiClickup,
  SiCoda,
  SiConfluence,
  SiDropbox,
  SiExpedia,
  SiFigma,
  SiGithub,
  SiGitlab,
  SiGmail,
  SiGoogledrive,
  SiGooglecalendar,
  SiGooglemaps,
  SiHubspot,
  SiIfttt,
  SiIntercom,
  SiJira,
  SiLinear,
  SiMailchimp,
  SiMiro,
  SiNotion,
  SiSentry,
  SiShopify,
  SiStatista,
  SiStripe,
  SiSupabase,
  SiTodoist,
  SiTrello,
  SiTrivago,
  SiTypeform,
  SiZapier,
  SiZoom,
} from 'react-icons/si';

/**
 * Real vendor logo for a connector, keyword-matched on its name/host.
 *
 * The only such list. The composer chip and the Konnektoren settings directory
 * (`apps/web/.../McpSection.tsx`, reaching it through the
 * `@gruenerator/chat/connectors` subpath) each kept their own; the copies
 * drifted to 13 and 15 entries with 10 in common, so the same service drew a
 * logo on one surface and a generic plug on the other. This is the union.
 *
 * It lives here rather than beside `mcpBrandColor` in `@gruenerator/shared`
 * because Metro bundles an entire react-icons pack for one named import
 * (~10 MB of source — `packages/shared/src/icons/index.ts` inlines icons via
 * GenIcon for exactly that reason). `packages/chat` already keeps its web-only
 * modules out of the native entry (`src/index.native.ts`), so `react-icons/si`
 * costs the mobile bundle nothing here. Do not re-export it from a barrel the
 * native entry touches.
 *
 * Slack, Outlook/Microsoft, Salesforce and Canva are deliberately absent:
 * simple-icons dropped them over trademark policy, so react-icons has no
 * export to import. They fall back to the generic plug like any unknown
 * service.
 */
const CONNECTOR_BRAND_ICONS: ReadonlyArray<readonly [RegExp, IconType]> = [
  [/github/i, SiGithub],
  [/gitlab/i, SiGitlab],
  [/notion/i, SiNotion],
  [/google\s*drive|drive\.google/i, SiGoogledrive],
  [/google\s*maps|mapstools|maps\.google/i, SiGooglemaps],
  [/google\s*calendar|calendar\.google/i, SiGooglecalendar],
  [/gmail|mail\.google/i, SiGmail],
  [/hubspot/i, SiHubspot],
  [/brevo/i, SiBrevo],
  [/zapier/i, SiZapier],
  [/todoist/i, SiTodoist],
  [/miro/i, SiMiro],
  [/statista/i, SiStatista],
  [/trivago/i, SiTrivago],
  [/jira/i, SiJira],
  [/confluence/i, SiConfluence],
  [/coda/i, SiCoda],
  [/typeform/i, SiTypeform],
  [/zoom/i, SiZoom],
  [/ifttt/i, SiIfttt],
  [/booking/i, SiBookingdotcom],
  [/expedia/i, SiExpedia],
  [/linear/i, SiLinear],
  [/asana/i, SiAsana],
  [/airtable/i, SiAirtable],
  [/dropbox/i, SiDropbox],
  [/figma/i, SiFigma],
  [/intercom/i, SiIntercom],
  [/stripe/i, SiStripe],
  [/shopify/i, SiShopify],
  [/sentry/i, SiSentry],
  [/supabase/i, SiSupabase],
  [/mailchimp/i, SiMailchimp],
  [/atlassian/i, SiAtlassian],
  [/clickup/i, SiClickup],
  [/calendly/i, SiCalendly],
  [/trello/i, SiTrello],
];

export function connectorBrandIcon(label: string): IconType | null {
  for (const [re, Icon] of CONNECTOR_BRAND_ICONS) if (re.test(label)) return Icon;
  return null;
}

/**
 * Composer-token chip ground, resolved per theme: the composer is
 * `bg-white dark:bg-surface` (5 % white over #1a1a1a), the chip adds
 * `bg-black/[0.05] dark:bg-white/10` on top. Both blends are opaque by the time
 * they reach the eye, so the contrast floor below can be measured against them.
 */
const CHIP_GROUND = {
  light: [242, 242, 242],
  dark: [59, 59, 59],
} as const satisfies Record<'light' | 'dark', readonly [number, number, number]>;

/** WCAG 2.2 SC 1.4.11 — non-text contrast for a glyph that carries meaning. */
const MIN_ICON_CONTRAST = 3;

/** `#rrggbb` or the `hsl(H S% L%)` mcpBrandColor emits, to RGB. */
export function parseColor(color: string): [number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  // mcpBrandColor falls back to `hsl(H 52% 45%)` for services with no entry.
  const hsl = /^hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%\s*\)$/i.exec(color.trim());
  if (!hsl) return null;
  const h = Number(hsl[1]) / 360;
  const s = Number(hsl[2]) / 100;
  const l = Number(hsl[3]) / 100;
  if (s === 0) return [Math.round(l * 255), Math.round(l * 255), Math.round(l * 255)];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number): number => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [
    Math.round(channel(h + 1 / 3) * 255),
    Math.round(channel(h) * 255),
    Math.round(channel(h - 1 / 3) * 255),
  ];
}

function relativeLuminance([r, g, b]: readonly [number, number, number]): number {
  const lin = (c: number): number => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function contrastRatio(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The brand colour for a token icon, lightened (dark mode) or darkened (light
 * mode) just far enough to stay visible on the chip.
 *
 * A logo is exempt from the text-contrast rules, but it still has to be *seen*:
 * Notion's near-black mark lands at 1.7:1 on the dark chip, an invisible blob.
 * Nor is that only the registry's problem — the `hsl(H 52% 45%)` mcpBrandColor
 * invents for unregistered services misses the floor at 197 of 360 hues in dark
 * mode and 152 in light, so the path every unknown connector takes fails more
 * often than not.
 *
 * Blending toward the ground's opposite keeps the hue, which dropping to the
 * label colour would throw away. Termination is guaranteed: pure white reaches
 * 11.2:1 on the dark chip, pure black 17.6:1 on the light one.
 */
export function legibleBrandColor(color: string, mode: 'light' | 'dark'): string {
  const rgb = parseColor(color);
  if (!rgb) return 'currentColor';
  const ground = CHIP_GROUND[mode];
  if (contrastRatio(rgb, ground) >= MIN_ICON_CONTRAST) return color;

  const toward = mode === 'dark' ? 255 : 0;
  for (let mix = 0.05; mix <= 1; mix += 0.05) {
    const blended: [number, number, number] = [
      Math.round(rgb[0] + (toward - rgb[0]) * mix),
      Math.round(rgb[1] + (toward - rgb[1]) * mix),
      Math.round(rgb[2] + (toward - rgb[2]) * mix),
    ];
    if (contrastRatio(blended, ground) >= MIN_ICON_CONTRAST) {
      return `rgb(${blended[0]} ${blended[1]} ${blended[2]})`;
    }
  }
  return mode === 'dark' ? 'rgb(255 255 255)' : 'rgb(0 0 0)';
}
