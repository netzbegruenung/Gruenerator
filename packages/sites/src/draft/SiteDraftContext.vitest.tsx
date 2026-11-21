import { setSiteField } from '@gruenerator/contracts/site-ydoc';
import { act, screen, render } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it } from 'vitest';

import { renderWithDraft } from '../test/renderWithDraft';

import { SiteDraftProvider, useDraft, useDraftActions } from './SiteDraftContext';
import { seededDoc } from './testDoc';

function Title() {
  const title = useDraft((draft) => draft.site_title);
  const { setField } = useDraftActions();
  return (
    <button type="button" onClick={() => setField('site_title', 'Geändert')}>
      {title}
    </button>
  );
}

describe('SiteDraftProvider', () => {
  it('renders the draft and follows edits made through the actions', async () => {
    const { user, ydoc } = renderWithDraft(<Title />, { site_title: 'Start' });
    expect(screen.getByRole('button')).toHaveTextContent('Start');
    await user.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('Geändert');
    expect(ydoc).toBeDefined();
  });

  it('follows remote changes to the doc', () => {
    const { ydoc } = renderWithDraft(<Title />, { site_title: 'Start' });
    act(() => {
      setSiteField(ydoc, 'site_title', 'Remote');
    });
    expect(screen.getByRole('button')).toHaveTextContent('Remote');
  });

  it('leaves no update listener behind under StrictMode, and none after unmount', () => {
    const ydoc = seededDoc();
    const observers = () =>
      (ydoc as unknown as { _observers: Map<string, Set<unknown>> })._observers.get('update')
        ?.size ?? 0;
    const view = render(
      <StrictMode>
        <SiteDraftProvider ydoc={ydoc}>
          <Title />
        </SiteDraftProvider>
      </StrictMode>
    );
    expect(observers()).toBe(1);
    view.unmount();
    expect(observers()).toBe(0);
  });

  it('adds and duplicates blocks through the actions', async () => {
    function Blocks() {
      const types = useDraft((draft) => draft.blocks.map((block) => block.type).join(','));
      const { addBlock, duplicateBlock } = useDraftActions();
      const firstAbout = useDraft((draft) => draft.blocks.find((b) => b.type === 'about')?.id);
      return (
        <>
          <output>{types}</output>
          <button type="button" onClick={() => addBlock('themes', 1)}>
            add
          </button>
          <button type="button" onClick={() => firstAbout && duplicateBlock(firstAbout)}>
            copy
          </button>
        </>
      );
    }
    const { user } = renderWithDraft(<Blocks />);
    await user.click(screen.getByRole('button', { name: 'add' }));
    await user.click(screen.getByRole('button', { name: 'copy' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'hero,themes,about,about,heroImage,themes,actions,socialFeed,contact'
    );
  });

  it('does not re-render a blocks slice when only site_title changes', () => {
    let renders = 0;
    function Themes() {
      useDraft((draft) => draft.blocks);
      renders += 1;
      return null;
    }
    const { ydoc } = renderWithDraft(<Themes />);
    const before = renders;
    act(() => {
      setSiteField(ydoc, 'site_title', 'Anders');
    });
    expect(renders).toBe(before);
  });
});
