import {
  applySharepicTweaks,
  type ComposedSharepic,
  deckPages,
  deckSpec,
  fingerprint,
  liftPage,
  recomposePage,
  sharepicTweaks,
  type SharepicTweak,
  type SharepicTweakChoice,
} from '@gruenerator/canvas-editor/composer';
import {
  SHAREPIC_SOURCE_KEY,
  type SharepicPhotoAttribution,
  type SharepicSource,
  type SharepicSpec,
} from '@gruenerator/contracts';

import { uploadSources } from './applySpecEdit';

import type { DesignPage, ReplaceDeckOps } from '@gruenerator/canvas-editor';

/**
 * The „Design" tab of the editor: a creator deck in another look (the
 * Studio's tweaks — navigation, page number, numbering, colour …), without
 * the model. Like a spec edit (`applySpecEdit`), each page is lifted, composed
 * afresh and gets its hand edits back where they still fit, and the deck is
 * replaced in one undo step. Only the choice changes; the slides stay.
 */

/** The composer, with `ownPhoto` resolving the person's own photos (`upload:N`). */
export type RetweakCompose = (
  spec: SharepicSpec,
  attributions: (SharepicPhotoAttribution | null)[],
  options: { ownPhoto: (filename: string) => string | undefined; kiLabel: boolean }
) => Promise<ComposedSharepic>;

const oneSlide = (spec: SharepicSpec, i: number): SharepicSpec => ({
  ...spec,
  slides: [spec.slides[i]!],
});

/** The AI label stays as the deck was made: on when a page carries it. */
const KI_LABEL_ID = 'sc-ki-label';

/** The deck's options as its pages stand; empty for an unknown or invalid deck. */
export function deckTweaks(pages: readonly DesignPage[], deck: string): SharepicTweak[] {
  const spec = deckSpec(pages, deck);
  if (!spec) return [];
  const choice = deckPages(pages, deck)[0]?.source.tweaks ?? {};
  return sharepicTweaks(spec, choice);
}

const MAX_PASSES = 3;

export async function retweakDeck(
  getPages: () => readonly DesignPage[],
  deck: string,
  choice: SharepicTweakChoice,
  compose: RetweakCompose
): Promise<{ ops: ReplaceDeckOps; dropped: number } | null> {
  for (let pass = 1; ; pass++) {
    const members = deckPages(getPages(), deck);
    if (members.length === 0) return null;
    const seen = JSON.stringify(members.map((m) => m.page.state));
    // Tweaks are a deck choice, minted alike on every page.
    const before = members[0]!.source.tweaks ?? {};
    const lifted = members.map((m) => liftPage(m.page.state, m.source));
    // The hand texts lifted in: the base spec the deck shows now.
    const base: SharepicSpec = {
      ...lifted[0]!.slide,
      slides: lifted.flatMap((l) => l.slide.slides),
    };
    const previous = applySharepicTweaks(base, before);
    const fresh = applySharepicTweaks(base, choice);
    const credits = members.map((m) => m.source.attribution ?? null);
    const uploads = uploadSources(members);
    const options = {
      ownPhoto: (filename: string) => uploads.get(filename),
      kiLabel: members.some((m) => KI_LABEL_ID in m.source.baseline.elements),
    };
    // A retyped text moves the composer's own styles: a hand style on that page
    // is judged against the lifted compose, not the stored baseline.
    const restyled = members.map(
      (m, i) =>
        lifted[i]!.overrides.some((o) => o.kind === 'style') &&
        JSON.stringify(lifted[i]!.slide) !== JSON.stringify(m.source.slide)
    );
    const [composed, previousComposed] = await Promise.all([
      compose(fresh, credits, options),
      restyled.some(Boolean) ? compose(previous, credits, options) : null,
    ]);

    // A hand edit made while composing would be overwritten: lift again.
    const now = deckPages(getPages(), deck);
    const raced = JSON.stringify(now.map((m) => m.page.state)) !== seen;
    if (raced && pass < MAX_PASSES) continue;

    const ops: ReplaceDeckOps = { updates: [], inserts: [], removes: [] };
    // Still racing after the last pass: what came in meanwhile is not applied, and counted.
    let dropped = raced
      ? now.filter((m) => {
          const was = members.find((x) => x.page.id === m.page.id);
          return was && JSON.stringify(was.page.state) !== JSON.stringify(m.page.state);
        }).length
      : 0;
    members.forEach((m, i) => {
      const baseline =
        previousComposed && restyled[i]
          ? fingerprint(previousComposed.slides[i]!)
          : m.source.baseline;
      const page = recomposePage(
        composed.slides[i]!,
        lifted[i]!.overrides,
        lifted[i]!.foreign,
        oneSlide(previous, i),
        oneSlide(fresh, i),
        baseline
      );
      dropped += page.droppedOverrides.length;
      const source: SharepicSource = {
        v: 1,
        deck,
        slide: oneSlide(base, i),
        attribution: m.source.attribution ?? null,
        ...(Object.keys(choice).length > 0 && { tweaks: choice }),
        baseline: page.baseline,
      };
      ops.updates.push({
        pageId: m.page.id,
        state: { ...page.state, [SHAREPIC_SOURCE_KEY]: source },
      });
    });
    return { ops, dropped };
  }
}
