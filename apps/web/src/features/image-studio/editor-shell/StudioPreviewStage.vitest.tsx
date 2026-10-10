import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StudioPreviewStage } from './StudioPreviewStage';

const A = 'data:image/png;base64,QQ==';
const B = 'data:image/png;base64,Qg==';

describe('StudioPreviewStage', () => {
  it('shows a waiting card with the status while nothing exists yet', () => {
    const { container } = render(
      <StudioPreviewStage images={[]} alt="Bild" busy status="Entwerfe …" aspect={4 / 5} />
    );
    expect(container.querySelector('.studio-stage-skeleton')).toBeInTheDocument();
    expect(screen.getByText('Entwerfe …')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('keeps the current image, dimmed under a sheen, while it is reworked', () => {
    const { container } = render(
      <StudioPreviewStage images={[A]} alt="Bild" busy status="Prüfe …" aspect={1} />
    );
    expect(screen.getByAltText('Bild')).toHaveClass('opacity-60');
    expect(container.querySelector('.studio-stage-sheen')).toBeInTheDocument();
    expect(screen.getByText('Prüfe …')).toBeInTheDocument();
  });

  it('shows the finished image without any waiting chrome', () => {
    const { container } = render(
      <StudioPreviewStage images={[A]} alt="Bild" busy={false} status={null} aspect={1} />
    );
    expect(screen.getByAltText('Bild')).not.toHaveClass('opacity-60');
    expect(container.querySelector('.studio-stage-sheen')).not.toBeInTheDocument();
  });

  it('lays a carousel out as named slides and reports an error', () => {
    render(
      <StudioPreviewStage
        images={[A, B]}
        alt="Bild"
        busy={false}
        status={null}
        aspect={1}
        error="Öffnen fehlgeschlagen."
      />
    );
    expect(screen.getByRole('list', { name: 'Folien des Karussells' })).toBeInTheDocument();
    expect(screen.getByAltText('Folie 2 von 2')).toHaveAttribute('src', B);
    expect(screen.getByRole('alert')).toHaveTextContent('Öffnen fehlgeschlagen.');
  });
});
