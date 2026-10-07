import {
  SHAREPIC_SOURCE_KEY,
  sharepicSourceSchema,
  type SharepicSource,
  type SharepicSpec,
} from '@gruenerator/contracts';

interface SourcePage {
  configId: string;
  state: Record<string, unknown>;
}

const CREATOR_CONFIGS: readonly string[] = ['freeform', 'freeform-at'];

/** Tolerant: anything that is not a valid v1 source on a freeform page reads as null. */
export function readSharepicSource(page: SourcePage): SharepicSource | null {
  if (!CREATOR_CONFIGS.includes(page.configId)) return null;
  const parsed = sharepicSourceSchema.safeParse(page.state?.[SHAREPIC_SOURCE_KEY]);
  return parsed.success ? parsed.data : null;
}

/** Pages of one deck, in the given (page) order, each with its parsed source. */
export function deckPages<P extends SourcePage>(
  pages: readonly P[],
  deck: string
): { page: P; source: SharepicSource }[] {
  const out: { page: P; source: SharepicSource }[] = [];
  for (const page of pages) {
    const source = readSharepicSource(page);
    if (source && source.deck === deck) out.push({ page, source });
  }
  return out;
}

/** Full deck spec: deck-level fields from the first page, slides concatenated in page order. */
export function deckSpec(pages: readonly SourcePage[], deck: string): SharepicSpec | null {
  const members = deckPages(pages, deck);
  if (members.length === 0) return null;
  const first = members[0].source.slide;
  return { ...first, slides: members.flatMap((m) => m.source.slide.slides) };
}
