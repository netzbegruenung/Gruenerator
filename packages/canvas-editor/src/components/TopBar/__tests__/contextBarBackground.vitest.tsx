import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ContextControls } from '../ContextControls';

import type { BackgroundControls } from '../../../configs/types';
import type { FloatingModuleState } from '../../../hooks/useFloatingModuleState';

/**
 * Die Hintergrund-Knöpfe der Kontextleiste: Farbfläche und Foto ersetzen den
 * früheren Hintergrund-Tab. Getrieben mit einer `BackgroundControls`-Attrappe,
 * wie sie `config.background` liefert.
 */

vi.mock('../../../sidebar/UserUploadsProvider', () => ({
  useUserUploads: () => ({
    items: [],
    isLoading: false,
    error: null,
    search: '',
    setSearch: () => {},
    upload: async () => null,
    hasMore: false,
    loadMore: async () => {},
  }),
}));

const HANDLERS = {
  handleMoveLayer: () => {},
  handleDuplicate: () => {},
  handleColorSelect: () => {},
  handleOpacityChange: () => {},
  handleFontSizeChange: () => {},
};

const PLANE: FloatingModuleState = { type: 'background', data: { id: 'background' } };
const PHOTO: FloatingModuleState = {
  type: 'image',
  data: { id: 'background-image', isPhoto: true, opacity: 1 },
};

function controls(overrides: Partial<BackgroundControls> = {}): BackgroundControls {
  return {
    colors: [
      { id: 'green', label: 'Grün', color: '#6CCD87' },
      { id: 'sand', label: 'Sand', color: '#F5F1E9' },
    ],
    currentColor: '#6CCD87',
    onColorChange: vi.fn(),
    onImageChange: vi.fn(),
    ...overrides,
  };
}

function renderBar(
  module: FloatingModuleState,
  background: BackgroundControls,
  onDeselect = vi.fn()
) {
  render(
    <ContextControls
      selectedElement={module.data.id}
      activeFloatingModule={module}
      canMoveUp
      canMoveDown
      canDuplicate={false}
      handlers={HANDLERS}
      background={background}
      onDeselect={onDeselect}
    />
  );
  return onDeselect;
}

const openPalette = () => userEvent.click(screen.getByLabelText('Farbpalette öffnen'));

describe('Farbfläche ausgewählt', () => {
  it('zeigt Farbe und Bild, aber weder Deckkraft noch Ebenen noch Duplizieren', () => {
    renderBar(PLANE, controls());
    expect(screen.getByLabelText('Farbpalette öffnen')).toBeInTheDocument();
    expect(screen.getByLabelText('Hintergrundbild: Bild')).toBeInTheDocument();
    expect(screen.queryByTitle('Ebene nach oben')).toBeNull();
    expect(screen.queryByLabelText('Duplizieren (Strg+D)')).toBeNull();
    expect(screen.queryByRole('slider')).toBeNull();
  });

  it('bietet die Vorlagenfarben zuerst, dann die Markenfarben und eine eigene Farbe', async () => {
    renderBar(PLANE, controls());
    await openPalette();
    const titles = screen
      .getAllByRole('button')
      .map((b) => b.getAttribute('title'))
      .filter(Boolean);
    expect(titles.slice(0, 2)).toEqual(['Grün', 'Sand']);
    expect(titles).toContain('Tanne');
    // Sand und Hellgrün stehen schon in der Vorlagenpalette: nicht doppelt.
    expect(titles.filter((t) => t === 'Sand')).toHaveLength(1);
    expect(screen.getByLabelText('Eigene Farbe')).toBeInTheDocument();
  });

  it('bleibt bei einer abgeleiteten Farbe (Slider) bei der Palette', async () => {
    renderBar(PLANE, controls({ paletteOnly: true }));
    await openPalette();
    expect(screen.queryByTitle('Tanne')).toBeNull();
    expect(screen.queryByLabelText('Eigene Farbe')).toBeNull();
  });

  it('setzt die gewählte Farbe', async () => {
    const background = controls();
    renderBar(PLANE, background);
    await openPalette();
    await userEvent.click(screen.getByTitle('Sand'));
    expect(background.onColorChange).toHaveBeenCalledWith('#F5F1E9');
  });

  it('holt ein ausgeblendetes Foto zurück (freeform)', async () => {
    const onRestoreImage = vi.fn();
    renderBar(PLANE, controls({ onRestoreImage }));
    await userEvent.click(screen.getByText('Foto zurück'));
    expect(onRestoreImage).toHaveBeenCalledOnce();
  });
});

describe('Foto ausgewählt', () => {
  const photo = (overrides: Partial<BackgroundControls> = {}) =>
    controls({
      currentImageSrc: '/api/share/abc/download',
      scale: 1.2,
      onScaleChange: vi.fn(),
      isLocked: false,
      onToggleLock: vi.fn(),
      ...overrides,
    });

  it('zeigt Ersetzen, Farbe, Zoom, Fixieren und Entfernen, aber keine Ebenen', () => {
    renderBar(PHOTO, photo());
    expect(screen.getByLabelText('Hintergrundbild: Ersetzen')).toBeInTheDocument();
    expect(screen.getByLabelText('Farbpalette öffnen')).toBeInTheDocument();
    expect(screen.getByLabelText('Bild zoomen')).toBeInTheDocument();
    expect(screen.getByLabelText('Hintergrund fixieren')).toBeInTheDocument();
    expect(screen.getByLabelText('Hintergrundbild entfernen')).toBeInTheDocument();
    expect(screen.queryByTitle('Ebene nach oben')).toBeNull();
  });

  it('fixiert über den Knopf', async () => {
    const background = photo();
    renderBar(PHOTO, background);
    await userEvent.click(screen.getByLabelText('Hintergrund fixieren'));
    expect(background.onToggleLock).toHaveBeenCalledOnce();
  });

  it('entfernt das Foto und hebt die Auswahl auf', async () => {
    const background = photo();
    const onDeselect = renderBar(PHOTO, background);
    await userEvent.click(screen.getByLabelText('Hintergrundbild entfernen'));
    expect(background.onImageChange).toHaveBeenCalledWith(null, undefined, null);
    expect(onDeselect).toHaveBeenCalledOnce();
  });

  it('eine Farbe ersetzt das Foto, wo die Farbe unter dem Foto liegt', async () => {
    const background = photo();
    const onDeselect = renderBar(PHOTO, background);
    await openPalette();
    await userEvent.click(screen.getByTitle('Tanne'));
    expect(background.onImageChange).toHaveBeenCalledWith(null, undefined, null);
    expect(background.onColorChange).toHaveBeenCalledWith('#005538');
    expect(onDeselect).toHaveBeenCalledOnce();
  });

  it('eine Farbe behält das Foto, wo sie es selbst ausblendet (freeform)', async () => {
    const background = photo({ colorReplacesImage: true });
    renderBar(PHOTO, background);
    await openPalette();
    await userEvent.click(screen.getByTitle('Tanne'));
    expect(background.onImageChange).not.toHaveBeenCalled();
    expect(background.onColorChange).toHaveBeenCalledWith('#005538');
  });
});

describe('eigenes Bild ausgewählt', () => {
  const userImage = (src: string): FloatingModuleState => ({
    type: 'user-image',
    data: { id: 'user-image-1', src, fileName: 'foto.jpg', opacity: 1 },
  });

  it('bietet „Als Hintergrund" für ein dauerhaft gespeichertes Bild', () => {
    render(
      <ContextControls
        selectedElement="user-image-1"
        activeFloatingModule={userImage('/api/share/abc/download')}
        canMoveUp
        canMoveDown
        canDuplicate
        handlers={{ ...HANDLERS, handleDeleteElement: vi.fn() }}
        background={controls()}
      />
    );
    expect(screen.getByText('Als Hintergrund')).toBeInTheDocument();
  });

  it('nicht für eine blob:-Vorschau, die das Neuladen nicht überlebt', () => {
    render(
      <ContextControls
        selectedElement="user-image-1"
        activeFloatingModule={userImage('blob:http://localhost/1')}
        canMoveUp
        canMoveDown
        canDuplicate
        handlers={{ ...HANDLERS, handleDeleteElement: vi.fn() }}
        background={controls()}
      />
    );
    expect(screen.queryByText('Als Hintergrund')).toBeNull();
  });
});
