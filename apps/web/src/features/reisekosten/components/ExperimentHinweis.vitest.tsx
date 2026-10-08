import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';

import { ExperimentHinweis } from './ExperimentHinweis';

describe('ExperimentHinweis', () => {
  it('says the tool is an experiment unrelated to the party bodies', async () => {
    const { container } = render(<ExperimentHinweis />);
    expect(screen.getByRole('note')).toHaveTextContent(
      'steht in keiner Verbindung zu den Gliederungen von BÜNDNIS 90/DIE GRÜNEN'
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
