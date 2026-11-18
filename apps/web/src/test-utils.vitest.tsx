import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from './test-utils';

// Guards the stricter `label` rule in test-utils: if an axe-core upgrade
// renames a check id, the override would silently stop working.
describe('axe label rule', () => {
  it('rejects a field named only by its placeholder', async () => {
    const { container } = render(<textarea placeholder="Nachricht schreiben..." />);
    const result = await axe(container);
    expect(result.violations.map((v) => v.id)).toContain('label');
  });

  it.each([
    ['aria-label', <textarea key="a" aria-label="Nachricht" placeholder="Schreibe..." />],
    [
      'label element',
      <label key="b">
        Nachricht
        <textarea placeholder="Schreibe..." />
      </label>,
    ],
  ])('accepts a field with a real name (%s)', async (_, field) => {
    const { container } = render(field);
    expect(await axe(container)).toHaveNoViolations();
  });
});
