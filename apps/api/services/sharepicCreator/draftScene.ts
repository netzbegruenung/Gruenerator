import { SHAREPIC_UPLOAD_ID, sharepicTextSideSchema } from '@gruenerator/contracts';
import { z } from 'zod';

/** Stands in for the scene while the draft is checked; replaced by the painted image. */
export const SCENE_PENDING = 'ki:szene-wird-gemalt';

const sceneSchema = z.object({
  kind: z.literal('szene'),
  motiv: z.string().trim().min(10).max(300),
  textSeite: sharepicTextSideSchema,
  /** An own photo with a person, painted into the scene as the reference. */
  person: z.string().regex(SHAREPIC_UPLOAD_ID).optional(),
});

export interface DraftScene {
  slide: number;
  motiv: string;
  person: string | null;
}

/**
 * Takes the `szene` background out of a draft: the schema only knows photos,
 * so the scene goes through validation as a photo with a placeholder ref, and
 * its description waits for the painter. One scene per draft — it costs trees
 * and half a minute.
 */
export function takeScene(
  input: unknown,
  /** Own photos a scene may paint a person from: server-side readable, with a person on them. */
  personable: ReadonlySet<string> = new Set()
): { ok: true; input: unknown; scene: DraftScene | null } | { ok: false; error: string } {
  const slides = (input as { slides?: unknown } | null)?.slides;
  if (!Array.isArray(slides)) return { ok: true, input, scene: null };
  const at = slides.flatMap((slide: unknown, i) =>
    (slide as { background?: { kind?: unknown } } | null)?.background?.kind === 'szene' ? [i] : []
  );
  if (!at.length) return { ok: true, input, scene: null };
  if (at.length > 1) {
    return {
      ok: false,
      error: `Höchstens eine szene pro Entwurf (Slides ${at.map((i) => i + 1).join(', ')}) – die anderen Slides bekommen eine Farbe oder ein Foto.`,
    };
  }
  const index = at[0]!;
  const parsed = sceneSchema.safeParse((slides[index] as { background: unknown }).background);
  if (!parsed.success) {
    return {
      ok: false,
      error: `Slide ${index + 1}: szene braucht "motiv" (Englisch, 10–300 Zeichen, nur die Szene – kein Text, keine Zahlen) und "textSeite".`,
    };
  }
  const { motiv, textSeite, person } = parsed.data;
  if (person && !personable.has(person)) {
    return {
      ok: false,
      error: `Slide ${index + 1}: person nur mit einem eigenen Foto, auf dem eine Person ist – sonst weglassen.`,
    };
  }
  const next = slides.map((slide: unknown, i) =>
    i === index
      ? {
          ...(slide as object),
          background: { kind: 'foto', filename: SCENE_PENDING, textSeite },
        }
      : slide
  );
  return {
    ok: true,
    input: { ...(input as object), slides: next },
    scene: { slide: index, motiv, person: person ?? null },
  };
}
