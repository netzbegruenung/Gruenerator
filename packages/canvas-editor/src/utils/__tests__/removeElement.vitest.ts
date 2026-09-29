import { describe, expect, it, vi } from 'vitest';

import { findElementRemover } from '../removeElement';

describe('findElementRemover', () => {
  it('löscht eine Instanz über ihre Aktion', () => {
    const removeIllustration = vi.fn();
    const remove = findElementRemover(
      { illustrationInstances: [{ id: 'ill-1' } as never] },
      { removeIllustration },
      'ill-1'
    );
    remove?.();
    expect(removeIllustration).toHaveBeenCalledWith('ill-1');
  });

  it('schaltet ein Icon ab statt es zu entfernen', () => {
    const toggleIcon = vi.fn();
    findElementRemover({ selectedIcons: ['icon-1'] }, { toggleIcon }, 'icon-1')?.();
    expect(toggleIcon).toHaveBeenCalledWith('icon-1', false);
  });

  it('liefert null für Vorlagen-Elemente und fehlende Aktionen', () => {
    expect(findElementRemover({}, {}, 'headline')).toBeNull();
    expect(findElementRemover({ shapeInstances: [{ id: 's' } as never] }, {}, 's')).toBeNull();
    expect(findElementRemover({}, {}, null)).toBeNull();
  });
});
