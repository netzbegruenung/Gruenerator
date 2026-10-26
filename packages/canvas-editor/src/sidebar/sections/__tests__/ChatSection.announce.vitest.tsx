import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  CanvasEditorProvider,
  type CanvasAiEditBridge,
  type CanvasSpecEditBridge,
  type ChatSectionContentProps,
} from '../../../CanvasEditorProvider';
import { AnnouncerContext } from '../../../hooks/useAnnounce';
import { AI_EDIT_APPLIED, ChatSection } from '../ChatSection';

import type { ApplyResult } from '../../../ai';

function setup(results: ApplyResult[]) {
  const announce = vi.fn();
  let received: ChatSectionContentProps | null = null;
  const ChatSectionContent = (props: ChatSectionContentProps) => {
    received = props;
    return null;
  };
  const aiEdit: CanvasAiEditBridge = {
    capabilityList: { supportedOperations: [] },
    getSnapshot: () => ({ template: 'freeform', textFields: [], elementsSummary: [] }),
    applyOperations: () => results,
  };
  const specEdit: CanvasSpecEditBridge = {
    getPages: () => [],
    getActivePageId: () => null,
    replaceDeck: () => ['p1'],
  };
  render(
    <AnnouncerContext.Provider value={{ announce, lastAnnouncedAt: { current: 0 } }}>
      <CanvasEditorProvider services={{ ChatSectionContent }}>
        <ChatSection
          canvasType="freeform"
          getSharepicText={() => ''}
          aiEdit={aiEdit}
          specEdit={specEdit}
        />
      </CanvasEditorProvider>
    </AnnouncerContext.Provider>
  );
  return { announce, props: () => received! };
}

describe('ChatSection sagt KI-Änderungen an', () => {
  it('Operationen: einmal je Stapel, wenn mindestens eine griff', () => {
    const { announce, props } = setup([{ ok: true }, { ok: false, reason: 'x' }]);
    props().aiEdit!.applyOperations([]);
    expect(announce).toHaveBeenCalledExactlyOnceWith(AI_EDIT_APPLIED);
  });

  it('Operationen: nichts bei leerem oder gescheitertem Stapel', () => {
    const failed = setup([{ ok: false, reason: 'x' }]);
    failed.props().aiEdit!.applyOperations([]);
    expect(failed.announce).not.toHaveBeenCalled();
    const empty = setup([]);
    empty.props().aiEdit!.applyOperations([]);
    expect(empty.announce).not.toHaveBeenCalled();
  });

  it('ganzes Deck: einmal bei Änderung, nichts bei leeren Operationen', () => {
    const { announce, props } = setup([]);
    const spec = props().specEdit!;
    expect(spec.replaceDeck({ updates: [], inserts: [], removes: [] })).toEqual(['p1']);
    expect(announce).not.toHaveBeenCalled();
    spec.replaceDeck({ updates: [{ pageId: 'p1', state: {} }], inserts: [], removes: [] });
    expect(announce).toHaveBeenCalledExactlyOnceWith(AI_EDIT_APPLIED);
  });
});
