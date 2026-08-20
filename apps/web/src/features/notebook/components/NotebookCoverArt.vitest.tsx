import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NotebookCoverArt from './NotebookCoverArt';

const titleSizeOf = (title: string, subtitle?: string) => {
  const { unmount } = render(<NotebookCoverArt title={title} subtitle={subtitle} />);
  const size = screen.getByText(title).style.fontSize;
  unmount();
  return size;
};

describe('NotebookCoverArt', () => {
  it('renders the notebook name and the subtitle line', () => {
    render(<NotebookCoverArt title="Kommunalpolitik" subtitle="von Jamie Grün" />);

    expect(screen.getByText('Kommunalpolitik')).toBeInTheDocument();
    expect(screen.getByText('von Jamie Grün')).toBeInTheDocument();
  });

  it('omits the subtitle line when none is given', () => {
    const { container } = render(<NotebookCoverArt title="Nur Titel" />);

    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('steps the type down as the name grows', () => {
    const short = titleSizeOf('Von der Basis');
    const medium = titleSizeOf('Beschlüsse des KV Nord');
    const long = titleSizeOf('Kommunalpolitik Kreisverband Nord und Umland');

    expect(parseFloat(short)).toBeGreaterThan(parseFloat(medium));
    expect(parseFloat(medium)).toBeGreaterThan(parseFloat(long));
  });

  it('caps a long compound word below the poster size so hyphenation can fit it', () => {
    // 'Bundesdelegiertenkonferenz' is short enough overall for the xl step, but
    // as one word it would overflow the tile — it must not get poster type.
    expect(parseFloat(titleSizeOf('Bundesdelegiertenkonferenz'))).toBeLessThan(
      parseFloat(titleSizeOf('Von der Basis'))
    );
  });

  it('sets a container so the cqw type scale resolves against the tile', () => {
    const { container } = render(<NotebookCoverArt title="Egal" />);

    expect((container.firstChild as HTMLElement).style.containerType).toBe('inline-size');
  });
});
