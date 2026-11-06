const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** `<fotograf>-<id>-unsplash.jpg`: an Unsplash photo id has eleven characters. */
const UNSPLASH_ID = /(?:^|-)([\w-]{11})-unsplash\.jpe?g$/;

export interface PhotoRefRepair {
  from: string;
  to: string;
}

/**
 * The model copies a listed Unsplash name with a typo in the photographer part
 * (live 06.11.2026: `iccup-XNtwmcRP-gw-unsplash.jpg`, three identical attempts at
 * temperature 0). The photo id names the photo: when it matches exactly one
 * listed name, that name replaces the typo. Works on the raw model JSON, before
 * the schema; any other unknown name stays for validation to reject.
 */
export function repairPhotoRefs(
  input: unknown,
  listed: readonly string[]
): { input: unknown; repairs: PhotoRefRepair[] } {
  if (!isRecord(input) || !Array.isArray(input.slides)) return { input, repairs: [] };
  const repairs: PhotoRefRepair[] = [];
  const fix = (name: unknown): unknown => {
    if (typeof name !== 'string' || listed.includes(name)) return name;
    const id = UNSPLASH_ID.exec(name)?.[1];
    if (!id) return name;
    const matches = [...new Set(listed.filter((l) => UNSPLASH_ID.exec(l)?.[1] === id))];
    if (matches.length !== 1) return name;
    repairs.push({ from: name, to: matches[0]! });
    return matches[0];
  };

  const slides = input.slides.map((slide: unknown) => {
    if (!isRecord(slide)) return slide;
    const background =
      isRecord(slide.background) && typeof slide.background.filename === 'string'
        ? { ...slide.background, filename: fix(slide.background.filename) }
        : slide.background;
    const items = Array.isArray(slide.items)
      ? slide.items.map((item: unknown) =>
          isRecord(item) && item.type === 'bild' && typeof item.quelle === 'string'
            ? { ...item, quelle: fix(item.quelle) }
            : item
        )
      : slide.items;
    return { ...slide, background, items };
  });
  return repairs.length ? { input: { ...input, slides }, repairs } : { input, repairs };
}
