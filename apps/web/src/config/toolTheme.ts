/**
 * Single source of truth for a tool's colour identity, shared between the colored
 * "Tools" tiles on the Arbeiten tab and the tool's own subpage background.
 *
 * Each entry pairs the tile's solid pastel field (design 1e / 1b palette) with a
 * matching, strongly-weakened radial `gradient` for the tool's landing page — the
 * same gradient idiom as the Wissen/Arbeiten shells, tinted to the tile's hue so a
 * page reads as "the same colour world" as the tile you tapped to get there.
 *
 * Class strings are literal (never built at runtime) so Tailwind's JIT keeps them.
 * Dark variants are muted, same-hue fields fading to a near-neutral dark.
 */
export interface ToolTheme {
  /** Colored square tile: bg + hover shadow. */
  tile: string;
  icon: string;
  title: string;
  desc: string;
  /** Subtle radial page gradient for the tool's subpage (light + dark). */
  gradient: string;
}

export const TOOL_THEME = {
  docs: {
    tile: 'bg-[#F6EFD4] hover:shadow-[0_14px_30px_rgba(107,90,18,0.22)] dark:bg-[#2B2612]',
    icon: 'text-[#6B5A12] dark:text-[#CBB86A]',
    title: 'text-[#4E4310] dark:text-[#E4D6A0]',
    desc: 'text-[#7D6F35] dark:text-[#AB9C64]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#FBF6E4_0%,#FDFAF0_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#221E12_0%,#17140C_55%,#0F0D08_100%)]',
  },
  boards: {
    tile: 'bg-[#E6F0D6] hover:shadow-[0_14px_30px_rgba(62,90,30,0.22)] dark:bg-[#202B14]',
    icon: 'text-[#3E5A1E] dark:text-[#A6C57C]',
    title: 'text-[#31471A] dark:text-[#C4DAA2]',
    desc: 'text-[#5E7440] dark:text-[#8DA66E]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#F2F7E8_0%,#F9FBF2_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#1A2113_0%,#12170D_55%,#0D0F09_100%)]',
  },
  sheets: {
    tile: 'bg-[#DDEEEC] hover:shadow-[0_14px_30px_rgba(30,79,73,0.22)] dark:bg-[#142B28]',
    icon: 'text-[#1E4F49] dark:text-[#7CC5BC]',
    title: 'text-[#193F3A] dark:text-[#A2DAD2]',
    desc: 'text-[#456B66] dark:text-[#6EA69E]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#ECF6F4_0%,#F6FBFA_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#132320_0%,#0E1817_55%,#090F0E_100%)]',
  },
  presentations: {
    tile: 'bg-[#F6E5D4] hover:shadow-[0_14px_30px_rgba(122,74,31,0.22)] dark:bg-[#2B1D12]',
    icon: 'text-[#7A4A1F] dark:text-[#CB9A6A]',
    title: 'text-[#5E3915] dark:text-[#E4C0A0]',
    desc: 'text-[#8A683F] dark:text-[#AB8864]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#FBF0E6_0%,#FDF8F2_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#221A12_0%,#17120C_55%,#0F0C08_100%)]',
  },
  canvas: {
    tile: 'bg-[#E9E7F2] hover:shadow-[0_14px_30px_rgba(62,54,99,0.22)] dark:bg-[#1F1B2E]',
    icon: 'text-[#3E3663] dark:text-[#A99ED1]',
    title: 'text-[#332B54] dark:text-[#C6BCE4]',
    desc: 'text-[#5F587E] dark:text-[#8E86AB]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#F3F2F9_0%,#F9F8FC_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#191622_0%,#110F17_55%,#0B0A0F_100%)]',
  },
  // Studio landing sub-tools — distinct hues so the strip reads as colourful as
  // the Arbeiten tools (teal / violet / orange / pink for reels).
  'canvas-vorlagen': {
    tile: 'bg-[#DDEEEC] hover:shadow-[0_14px_30px_rgba(30,79,73,0.22)] dark:bg-[#142B28]',
    icon: 'text-[#1E4F49] dark:text-[#7CC5BC]',
    title: 'text-[#193F3A] dark:text-[#A2DAD2]',
    desc: 'text-[#456B66] dark:text-[#6EA69E]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#ECF6F4_0%,#F6FBFA_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#132320_0%,#0E1817_55%,#090F0E_100%)]',
  },
  'canvas-ki': {
    tile: 'bg-[#E9E7F2] hover:shadow-[0_14px_30px_rgba(62,54,99,0.22)] dark:bg-[#1F1B2E]',
    icon: 'text-[#3E3663] dark:text-[#A99ED1]',
    title: 'text-[#332B54] dark:text-[#C6BCE4]',
    desc: 'text-[#5F587E] dark:text-[#8E86AB]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#F3F2F9_0%,#F9F8FC_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#191622_0%,#110F17_55%,#0B0A0F_100%)]',
  },
  'canvas-sharepics': {
    tile: 'bg-[#F6E5D4] hover:shadow-[0_14px_30px_rgba(122,74,31,0.22)] dark:bg-[#2B1D12]',
    icon: 'text-[#7A4A1F] dark:text-[#CB9A6A]',
    title: 'text-[#5E3915] dark:text-[#E4C0A0]',
    desc: 'text-[#8A683F] dark:text-[#AB8864]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#FBF0E6_0%,#FDF8F2_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#221A12_0%,#17120C_55%,#0F0C08_100%)]',
  },
  'reels-untertitel': {
    tile: 'bg-[#F5DEE6] hover:shadow-[0_14px_30px_rgba(138,62,92,0.22)] dark:bg-[#2B1620]',
    icon: 'text-[#8A3E5C] dark:text-[#CB8AA6]',
    title: 'text-[#6E2E48] dark:text-[#E4B0C6]',
    desc: 'text-[#9E6A80] dark:text-[#AB7E94]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#FBEDF2_0%,#FDF7FA_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#22141A_0%,#170E12_55%,#0F090C_100%)]',
  },
  agents: {
    tile: 'bg-[#DCE6F2] hover:shadow-[0_14px_30px_rgba(46,78,122,0.22)] dark:bg-[#14202E]',
    icon: 'text-[#2E4E7A] dark:text-[#7CA2CB]',
    title: 'text-[#1E3A5E] dark:text-[#A2C0E4]',
    desc: 'text-[#56708F] dark:text-[#6E88AB]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#ECF2F9_0%,#F6F9FC_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#131C26_0%,#0E1319_55%,#090D10_100%)]',
  },
  weitere: {
    tile: 'bg-[#E7EAE6] hover:shadow-[0_14px_30px_rgba(74,85,76,0.20)] dark:bg-[#1C211D]',
    icon: 'text-[#4A554C] dark:text-[#9CA99F]',
    title: 'text-[#313A34] dark:text-[#C0CCC3]',
    desc: 'text-[#5F6A61] dark:text-[#8A968C]',
    gradient:
      'bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#EEF1EC_0%,#F7F9F6_55%,#FFFFFF_100%)] dark:bg-[image:radial-gradient(ellipse_55%_45%_at_50%_50%,#191D1A_0%,#11140F_55%,#0C0F0B_100%)]',
  },
} satisfies Record<string, ToolTheme>;

export type ToolThemeKey = keyof typeof TOOL_THEME;

export const getToolTheme = (key: string): ToolTheme | undefined =>
  (TOOL_THEME as Record<string, ToolTheme>)[key];

/** Page-background gradient for a tool's subpage, or undefined if the tool has no theme. */
export const getToolGradient = (key: string): string | undefined => getToolTheme(key)?.gradient;
