/**
 * One look per carousel. Measured on the 18 designed party carousels of
 * 10/2026 (social-korpus): the surface stays the same in 11, changes exactly
 * once in 6 — right after the cover, or for the last one or two slides after
 * a photo story — and never comes back. A fixed colour never hands the closing
 * slides to another colour. Gemma drafted surfaces in a zig-zag (tanne → mint → tanne
 * → grasgrün) and dropped a photo on single slides in the middle. The GRÜNE
 * JUGEND carousels alternate two colours instead (gj social-korpus 10/2026).
 */
import { type SharepicColor, type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';

/** The surface a slide reads as: its colour, the panel beside a photo, or a full photo. */
function surface(slide: SharepicSlide): string {
  const bg = slide.background;
  return bg.kind === 'farbe' ? bg.color : bg.kind === 'foto' ? 'foto' : bg.panelColor;
}

const SURFACE_NAME: Record<string, string> = { foto: 'Foto' };

/** Consecutive slides on the same surface: [first index, surface]. */
function runs(slides: readonly SharepicSlide[]): { start: number; end: number; surface: string }[] {
  const out: { start: number; end: number; surface: string }[] = [];
  slides.forEach((slide, i) => {
    const s = surface(slide);
    const last = out[out.length - 1];
    if (last?.surface === s) last.end = i;
    else out.push({ start: i, end: i, surface: s });
  });
  return out;
}

/** The blocks a slide is built from, in reading order. */
const buildOf = (slide: SharepicSlide) => slide.items.map((i) => i.type).join(' + ');

/**
 * A photo story and a text slider repeat one build on purpose (the Vorlagen
 * do); everything else changes its build between cover and close. Drafts held
 * one build through the whole middle (26.11.2026: 19 of 42 neighbours alike,
 * with the catalogue's slide kinds in the prompt).
 */
function repeatsOnPurpose(slide: SharepicSlide): boolean {
  return (
    slide.background.kind === 'foto' ||
    !!slide.zeilenboxen ||
    slide.items.every((i) => i.type === 'absatz' || i.type === 'text')
  );
}

const RUN = 3;

function repeatedBuild(slides: readonly SharepicSlide[]): string | null {
  const middle = slides.slice(1, -1);
  for (let i = 0; i + RUN <= middle.length; i++) {
    const run = middle.slice(i, i + RUN);
    const build = buildOf(run[0]!);
    if (run.every((s) => buildOf(s) === build && !repeatsOnPurpose(s))) {
      return `Die Slides ${i + 2}–${i + RUN + 1} sind gleich gebaut (${build}). Baue mindestens eine davon anders – eine andere Art aus den Slide-Arten der Vorlagen, z. B. eine liste, frage + absatz, eine große Zahl oder ein bild.`;
    }
  }
  return null;
}

/** The surface rule alone: how the colours change across the slides, or null when they hold. */
function surfaceProblem(spec: SharepicSpec): string | null {
  const slides = spec.slides;
  const n = slides.length;
  const parts = runs(slides);
  const sequence = slides.map((s) => SURFACE_NAME[surface(s)] ?? surface(s)).join(' → ');
  const change = parts[1]?.start;
  // The youth organisations alternate a primary with white (GJ DE) or with a
  // second colour (GJ AT erklär slides) across a carousel; two colours hold.
  const twoColours =
    spec.brand === 'gruene-jugend' &&
    new Set(parts.map((p) => p.surface).filter((s) => s !== 'foto')).size <= 2;
  if (twoColours) return null;
  if (parts.length > 2) {
    return `Die Flächen springen (${sequence}). Erlaubt ist höchstens EIN Wechsel und nie zurück: alle Slides auf derselben Farbe, oder eine Fotostrecke, nach der Forderung und Schluss gemeinsam auf eine Farbe wechseln.`;
  }
  if (change === undefined || change === 1) return null;
  // Late changes in the corpus all leave a photo story; a fixed colour holds to the end.
  if (change < n - 2) {
    return `Die Fläche wechselt mitten im Karussell auf Slide ${change + 1} (${sequence}). Ein Wechsel gehört direkt hinter das Cover oder, nach einer Fotostrecke, auf die letzten zwei Slides.`;
  }
  if (parts[0]!.surface !== 'foto') {
    return `Die letzten Slides wechseln die Farbe (${sequence}). Auf einer festen Farbe bleiben auch Forderung und Schluss – nimm überall ${parts[0]!.surface}.`;
  }
  return null;
}

/**
 * The last attempt is accepted as it comes, and with the slide kinds in the
 * prompt it often still changed colours (5 and 8 of 18 carousels, 26.11.2026,
 * against 0 before). What the rule wants is unambiguous, so it is applied:
 * every colour slide after the cover takes the surface of the first one. A
 * photo story keeps its own change, and an infographic keeps its light ground.
 */
export function holdCarouselSurface(spec: SharepicSpec): SharepicSpec {
  if (spec.slides.length < 3 || !surfaceProblem(spec)) return spec;
  const first = spec.slides[1]!;
  if (first.background.kind === 'foto') return spec;
  const target = surface(first) as SharepicColor;
  return {
    ...spec,
    slides: spec.slides.map((slide, i) => {
      const bg = slide.background;
      if (i === 0 || slide.items.some((item) => item.type === 'infografik')) return slide;
      if (bg.kind === 'farbe') return { ...slide, background: { ...bg, color: target } };
      if (bg.kind === 'foto-oben' || bg.kind === 'foto-unten') {
        return { ...slide, background: { ...bg, panelColor: target } };
      }
      return slide;
    }),
  };
}

/** Why a new carousel does not hold together, or null when it does. */
export function carouselLookProblems(spec: SharepicSpec): string | null {
  const slides = spec.slides;
  const n = slides.length;
  if (n < 3) return null;
  const problems: string[] = [];
  const parts = runs(slides);
  const jump = surfaceProblem(spec);
  if (jump) problems.push(jump);
  if (spec.locale === 'de-DE') {
    for (const part of parts) {
      const kinds = new Set(
        slides.slice(Math.max(part.start, 1), part.end + 1).map((s) => s.background.kind)
      );
      if (kinds.size > 1) {
        problems.push(
          `Slides ${Math.max(part.start, 1) + 1}–${part.end + 1} mischen Fotos und Farbflächen. Ein Foto steht entweder nur auf dem Cover oder auf jeder Slide dieser Strecke in derselben Art.`
        );
      }
    }
  }
  for (const part of parts) {
    const middle = slides.slice(Math.max(part.start, 1), Math.min(part.end + 1, n - 1));
    if (new Set(middle.map((s) => s.align)).size > 1) {
      problems.push(
        `Die Ausrichtung wechselt zwischen links und zentriert (Slides ${Math.max(part.start, 1) + 1}–${Math.min(part.end + 1, n - 1)}). Zwischen Cover und Schluss bleibt sie gleich.`
      );
    }
  }
  const look = problems.length
    ? `Karussell: ein Look für alle Slides. ${problems.join(' ')} Behalte Texte und Reihenfolge, ändere nur Hintergründe und Ausrichtung.`
    : null;
  const sameBuild = repeatedBuild(slides);
  return [look, sameBuild].filter(Boolean).join(' ') || null;
}
