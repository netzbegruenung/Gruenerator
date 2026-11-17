import { describe, expect, it, vi } from 'vitest';

import { uploadsSectionEntry } from './commonSections';

describe('uploadsSectionEntry', () => {
  const props = (actions: Record<string, unknown>) =>
    uploadsSectionEntry.propsFactory(undefined, actions, undefined) as {
      onRemovePlaced?: (id: string) => void;
    };

  it('takes back a failed upload with discardPlacedUserImage, not the undoable delete', () => {
    const discardPlacedUserImage = vi.fn();
    const removeUserImage = vi.fn();
    props({ discardPlacedUserImage, removeUserImage }).onRemovePlaced?.('a');
    expect(discardPlacedUserImage).toHaveBeenCalledWith('a');
    expect(removeUserImage).not.toHaveBeenCalled();
  });

  it('falls back to removeUserImage when the action set has no discard', () => {
    const removeUserImage = vi.fn();
    props({ removeUserImage }).onRemovePlaced?.('b');
    expect(removeUserImage).toHaveBeenCalledWith('b');
  });
});
