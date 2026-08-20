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
  landing: false,
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

  describe('on a landing (/agents/:slug, ?mode=…)', () => {
    // The regression: opening an agent while an older thread was still the
    // runtime's main rewrote the URL to that thread, which then bounced back to
    // bare /chat and reset the agent — the user landed on the welcome screen.
    it('does not claim the URL for a thread that was already open', () => {
      expect(
        reconcileThreadUrl(
          state({
            mainRemoteId: 'alt',
            mainSuffix: 'aaa111',
            mainTitle: 'Alter Chat',
            prevRemoteId: 'alt',
            landing: true,
          })
        )
      ).toEqual({ type: 'none' });
    });

    it('still canonicalises a thread minted right here', () => {
      expect(
        reconcileThreadUrl(
          state({
            mainRemoteId: 'neu',
            mainSuffix: 'bbb222',
            mainTitle: 'Frisch',
            prevRemoteId: null,
            landing: true,
          })
        )
      ).toEqual({ type: 'replace', slug: 'frisch-bbb222' });
    });

    it('leaves a thread URL alone (the landing flag only guards the bare case)', () => {
      expect(
        reconcileThreadUrl(
          state({
            mainRemoteId: 't1',
            mainSuffix: 'abc123',
            mainTitle: 'Neuer Titel',
            threadSlug: 'chat-abc123',
            suffix: 'abc123',
            prevRemoteId: 't1',
            landing: true,
          })
        )
      ).toEqual({ type: 'replace', slug: 'neuer-titel-abc123' });
    });
  });
});
