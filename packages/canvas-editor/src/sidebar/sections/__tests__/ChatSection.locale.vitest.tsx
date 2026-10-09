import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { buildAssetCapability } from '../../../ai/assetCapability';
import {
  CanvasEditorProvider,
  type CanvasAiEditBridge,
  type ChatSectionContentProps,
} from '../../../CanvasEditorProvider';
import { ChatSection } from '../ChatSection';

function sentAssetIds(userLocale: 'de-DE' | 'de-AT'): string[] {
  let received: CanvasAiEditBridge | undefined;
  const ChatSectionContent = ({ aiEdit }: ChatSectionContentProps) => {
    received = aiEdit;
    return null;
  };
  const aiEdit: CanvasAiEditBridge = {
    capabilityList: {
      supportedOperations: ['add-asset'],
      assets: buildAssetCapability('freeform'),
    },
    getSnapshot: () => ({ template: 'freeform', textFields: [], elementsSummary: [] }),
    applyOperations: () => [],
  };
  render(
    <CanvasEditorProvider services={{ ChatSectionContent, userLocale }}>
      <ChatSection canvasType="freeform" getSharepicText={() => ''} aiEdit={aiEdit} />
    </CanvasEditorProvider>
  );
  return (received?.capabilityList.assets ?? []).map((a) => a.id);
}

describe('ChatSection gibt der KI nur Assets der eigenen Sprache', () => {
  it('DE: keine AT-Logos', () => {
    const ids = sentAssetIds('de-DE');
    expect(ids).toContain('gruene-de-logo');
    expect(ids.some((id) => id.startsWith('gruene-at-'))).toBe(false);
  });

  it('AT: keine DE-Logos', () => {
    const ids = sentAssetIds('de-AT');
    expect(ids).toContain('gruene-at-logo-weiss');
    expect(ids.some((id) => id.startsWith('gruene-de-') || id.startsWith('sunflower'))).toBe(false);
  });
});
