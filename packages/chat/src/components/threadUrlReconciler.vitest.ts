import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { describe, expect, it } from 'vitest';

import { reconcileThreadUrl, type ThreadUrlState } from './threadUrlReconciler';

const base: ThreadUrlState = {
  mainRemoteId: null,
  mainSuffix: null,
  mainTitle: null,
  threadSlug: null,
  suffix: null,
  prevRemoteId: null,
  slugStillResolves: false,
};

const state = (over: Partial<ThreadUrlState>): ThreadUrlState => ({ ...base, ...over });

describe('reconcileThreadUrl', () => {
  it('writes the URL when a draft mints a thread (URL still bare /chat)', () => {
    expect(
      reconcileThreadUrl(
        state({ mainRemoteId: 't1', mainSuffix: 'abc123', mainTitle: 'Mein Chat' })
      )
    ).toEqual({ type: 'replace', slug: 'mein-chat-abc123' });
  });

  it('mints without a title yet', () => {
    expect(reconcileThreadUrl(state({ mainRemoteId: 't1', mainSuffix: 'abc123' }))).toMatchObject({
      type: 'replace',
    });
  });

  it('re-canonicalises the same thread when a title arrives', () => {
    expect(
      reconcileThreadUrl(
        state({
          mainRemoteId: 't1',
          mainSuffix: 'abc123',
          mainTitle: 'Neuer Titel',
          threadSlug: 'chat-abc123',
          suffix: 'abc123',
        })
      )
    ).toEqual({ type: 'replace', slug: 'neuer-titel-abc123' });
  });

  it('stays silent once the URL already matches', () => {
    expect(
      reconcileThreadUrl(
        state({
          mainRemoteId: 't1',
          mainSuffix: 'abc123',
          mainTitle: 'Mein Chat',
          threadSlug: 'mein-chat-abc123',
          suffix: 'abc123',
        })
      )
    ).toEqual({ type: 'none' });
  });

  // The regression this whole rewrite exists for: while a URL-driven switch is
  // in flight the URL names B and main is still A. Writing A's slug here is what
  // made the two directions chase each other between two threads.
  it('stays silent while a switch to another thread is in flight', () => {
    expect(
      reconcileThreadUrl(
        state({
          mainRemoteId: 'a',
          mainSuffix: 'aaa111',
          mainTitle: 'Thread A',
          threadSlug: 'thread-b-bbb222',
          suffix: 'bbb222',
          prevRemoteId: 'a',
          slugStillResolves: true,
        })
      )
    ).toEqual({ type: 'none' });
  });

  it('leaves legacy rows without a slug suffix alone', () => {
    expect(
      reconcileThreadUrl(state({ mainRemoteId: 't1', mainSuffix: null, mainTitle: 'Alt' }))
    ).toEqual({ type: 'none' });
  });

  it('reports "gone" when the open thread was deleted', () => {
    expect(
      reconcileThreadUrl(
        state({
          threadSlug: 'weg-abc123',
          suffix: 'abc123',
          prevRemoteId: 't1',
          slugStillResolves: false,
        })
      )
    ).toEqual({ type: 'gone' });
  });

  it('reports "leave" when the runtime moved to a draft but the thread lives', () => {
    expect(
      reconcileThreadUrl(
        state({
          threadSlug: 'da-abc123',
          suffix: 'abc123',
          prevRemoteId: 't1',
          slugStillResolves: true,
        })
      )
    ).toEqual({ type: 'leave' });
  });

  it('does not report "gone" for the initial draft on a cold deep link', () => {
    // Boot: main is the runtime's own fresh draft, no thread was open before.
    expect(
      reconcileThreadUrl(state({ threadSlug: 'deep-abc123', suffix: 'abc123', prevRemoteId: null }))
    ).toEqual({ type: 'none' });
  });

  it('stays silent on bare /chat with a draft', () => {
    expect(reconcileThreadUrl(state({ prevRemoteId: 't1' }))).toEqual({ type: 'none' });
  });

  // Der URL→Thread-Effekt hat `switchToNewThread()` schon angefordert, aber
  // assistant-ui erledigt das asynchron: `mainRemoteId` nennt hier noch den
  // Thread, den die URL gerade verlassen hat. Ihn zurückzuschreiben startete die
  // Schleife aus GlitchTip 564. Dieselbe Prüfung deckt die Landings ab
  // (/agents/:slug, ?mode=…), für die sie einmal allein gedacht war: dort warf
  // der Rückschreiber die Person aus dem eben geöffneten Agenten in ihre letzte
  // Unterhaltung.
  // Legacy links carry the bare remoteId instead of a slug (Projekt chat rows
  // still build these for threads predating the backfill). `extractSlugSuffix`
  // returns null for them just as it does for bare /chat — so a guard keyed on
  // `suffix` reads them as "the URL names no thread" and stops canonicalising
  // them for good, against the F0 rule that an old path keeps resolving.
  describe('a legacy /chat/<uuid> link', () => {
    const UUID = '2cfd460f-1289-40ec-b921-3063473b2c81';

    it('canonicalises to the slug once its thread is main', () => {
      expect(
        reconcileThreadUrl(
          state({
            mainRemoteId: UUID,
            mainSuffix: 'wTQqqi',
            mainTitle: 'Alter Chat',
            threadSlug: UUID,
            prevRemoteId: 'ein-anderer',
          })
        )
      ).toEqual({ type: 'replace', slug: 'alter-chat-wTQqqi' });
    });

    it('stays silent while the switch to it is still in flight', () => {
      expect(
        reconcileThreadUrl(
          state({
            mainRemoteId: 'a',
            mainSuffix: 'aaaaaa',
            mainTitle: 'Thread A',
            threadSlug: UUID,
            prevRemoteId: 'a',
          })
        )
      ).toEqual({ type: 'none' });
    });
  });

  it('stays silent on bare /chat while the runtime is still parking on a draft', () => {
    expect(
      reconcileThreadUrl(
        state({
          mainRemoteId: 't1',
          mainSuffix: 'abc123',
          mainTitle: 'Alter Chat',
          prevRemoteId: 't1',
        })
      )
    ).toEqual({ type: 'none' });
  });
});

/**
 * Fährt die beiden Effekte aus `ChatThreadRouting` gegeneinander, in ihrer
 * echten Reihenfolge und mit ihren echten Abhängigkeiten:
 *
 *  - URL → Thread läuft nur, wenn sich die URL geändert hat, und ist der
 *    einzige, der wechselt (bare /chat parkt auf einem Draft, eine Thread-URL
 *    öffnet ihren Thread). assistant-ui erledigt beides asynchron — siehe
 *    `lib/auiAsync.ts`.
 *  - thread → URL läuft im selben Commit und liest deshalb noch den ALTEN
 *    Hauptthread.
 *
 * Ein Modell, kein Bauteil: es hält genau die Tatsache fest, aus der die
 * Schleife entstand, damit der Reconciler gegen sie geprüft werden kann.
 */
// Suffix und Slug aus dem echten Ereignis. Das Alphabet in `slug.ts` kennt
// weder `1` noch `0` — ein erfundenes `abc123` löste `extractSlugSuffix` nie auf.
const THREAD = { remoteId: 'R', suffix: 'wTQqqi', slug: 'chat-wTQqqi' };

function runBothDirections(start: {
  url: string | null;
  main: string | null;
  prev: string | null;
  /** Kam dieser Zustand aus einer Navigation (dann läuft URL → Thread an)? */
  urlJustChanged: boolean;
}) {
  let { url, main, prev, urlJustChanged } = start;
  const navigations: (string | null)[] = [];

  for (let tick = 0; tick < 12; tick++) {
    let pending: string | null = null;
    if (urlJustChanged) {
      urlJustChanged = false;
      if (url === null) pending = main === null ? null : 'draft';
      else pending = main === THREAD.remoteId ? null : THREAD.remoteId;
    }

    const suffix = url ? extractSlugSuffix(url) : null;
    const action = reconcileThreadUrl({
      mainRemoteId: main,
      mainSuffix: main ? THREAD.suffix : null,
      mainTitle: null,
      threadSlug: url,
      suffix,
      prevRemoteId: prev,
      slugStillResolves: suffix === THREAD.suffix,
    });
    prev = main;

    if (action.type !== 'none') {
      url = action.type === 'replace' ? action.slug : null;
      urlJustChanged = true;
      navigations.push(url);
    } else if (pending === null) {
      return { settled: true, navigations };
    }

    if (pending) main = pending === 'draft' ? null : pending;
  }
  return { settled: false, navigations };
}

describe('both directions together', () => {
  // GlitchTip 564: Safari wirft `SecurityError` nach 100 `history.replaceState()`
  // in 10 s. Die Breadcrumbs zeigen den Grund — /chat/chat-<suffix> und /chat im
  // Wechsel, ~30 ms auseinander, über eine halbe Sekunde. Auf blankem /chat
  // schrieb der Reconciler den Hauptthread zurück in die URL, während der
  // URL→Thread-Effekt ihn gerade gegen einen Draft tauschte; der Draft landete
  // danach und las sich als „Thread verlassen" — zurück auf /chat.
  it('settles instead of oscillating after leaving a thread for bare /chat', () => {
    const { settled, navigations } = runBothDirections({
      url: null,
      main: THREAD.remoteId,
      prev: THREAD.remoteId,
      urlJustChanged: true,
    });
    expect(navigations).toEqual([]);
    expect(settled).toBe(true);
  });

  it('leaves the thread URL exactly once when the runtime moves to a draft', () => {
    const { settled, navigations } = runBothDirections({
      url: THREAD.slug,
      main: null,
      prev: THREAD.remoteId,
      urlJustChanged: false,
    });
    expect(navigations).toEqual([null]);
    expect(settled).toBe(true);
  });

  it('still writes the URL once for a thread minted from a draft on bare /chat', () => {
    const { settled, navigations } = runBothDirections({
      url: null,
      main: THREAD.remoteId,
      prev: null,
      urlJustChanged: false,
    });
    expect(navigations).toEqual([THREAD.slug]);
    expect(settled).toBe(true);
  });
});
