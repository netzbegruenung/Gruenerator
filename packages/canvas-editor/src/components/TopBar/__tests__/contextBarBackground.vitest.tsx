import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ContextControls } from '../ContextControls';

import type { BackgroundControls } from '@ggraphic/editor/configs/types';
import type { FloatingModuleState } from '@ggraphic/editor/hooks/useFloatingModuleState';
import type * as MediaPlacement from '@ggraphic/editor/utils/mediaPlacement';

/**
 * Die Hintergrund-Knöpfe der Kontextleiste: Farbfläche und Foto ersetzen den
 * früheren Hintergrund-Tab. Getrieben mit einer `BackgroundControls`-Attrappe,
 * wie sie `config.background` liefert.
 */

vi.mock('@ggraphic/editor/sidebar/UserUploadsProvider', () => {
  const uploads = {
    items: [],
    isLoading: false,
    error: null,
    search: '',
    setSearch: () => {},
    upload: async () => null,
    hasMore: false,
    loadMore: async () => {},
  };
  return { useUserUploads: () => uploads, useOptionalUserUploads: () => uploads };
});

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
  data: { id: 'background-image', isPhoto: true, canCrop: true, opacity: 1 },
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
  onDeselect = vi.fn(),
  { handleCropImage = vi.fn(), isCropping = false } = {}
) {
  render(
    <ContextControls
      selectedElement={module.data.id}
      activeFloatingModule={module}
      canMoveUp
      canMoveDown
      canDuplicate={false}
      isCropping={isCropping}
      handlers={{ ...HANDLERS, handleCropImage }}
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
      ...overrides,
    });

  it('zeigt Ersetzen, Farbe, Zoom, Ausschnitt und Entfernen, aber keine Ebenen', () => {
    renderBar(PHOTO, photo());
    expect(screen.getByLabelText('Hintergrundbild: Ersetzen')).toBeInTheDocument();
    expect(screen.getByLabelText('Farbpalette öffnen')).toBeInTheDocument();
    expect(screen.getByLabelText('Bild zoomen')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ausschnitt anpassen' })).toHaveTextContent(
      'Ausschnitt'
    );
    expect(screen.getByLabelText('Hintergrundbild entfernen')).toBeInTheDocument();
    expect(screen.queryByTitle('Ebene nach oben')).toBeNull();
  });

  it('schaltet den Ausschnitt-Modus über den Knopf', async () => {
    const handleCropImage = vi.fn();
    renderBar(PHOTO, photo(), vi.fn(), { handleCropImage });
    const button = screen.getByRole('button', { name: 'Ausschnitt anpassen' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(button);
    expect(handleCropImage).toHaveBeenCalledOnce();
  });

  it('zeigt den aktiven Ausschnitt-Modus als gedrückt', () => {
    renderBar(PHOTO, photo(), vi.fn(), { isCropping: true });
    expect(screen.getByRole('button', { name: 'Ausschnitt anpassen' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('zeigt keinen Ausschnitt, wenn das Foto weder ziehbar noch zoombar ist', () => {
    renderBar({ ...PHOTO, data: { ...PHOTO.data, canCrop: false } }, photo());
    expect(screen.queryByRole('button', { name: 'Ausschnitt anpassen' })).toBeNull();
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

vi.mock('@ggraphic/editor/utils/mediaPlacement', async (importOriginal) => ({
  ...(await importOriginal<typeof MediaPlacement>()),
  fetchShareImageFile: async () => new File(['x'], 'foto.jpg'),
}));

describe('eigenes Bild ausgewählt', () => {
  it('„Als Hintergrund" entfernt genau das geklickte Bild, auch wenn die Auswahl inzwischen wechselt', async () => {
    const onRemoveUserImage = vi.fn();
    const background = controls();
    const { rerender } = render(
      <ContextControls
        selectedElement="user-image-1"
        activeFloatingModule={userImage('/api/share/abc/download')}
        canMoveUp
        canMoveDown
        canDuplicate
        handlers={HANDLERS}
        background={background}
        onRemoveUserImage={onRemoveUserImage}
      />
    );
    await userEvent.click(screen.getByText('Als Hintergrund'));
    // Auswahl springt weiter, bevor der Abruf fertig ist.
    rerender(
      <ContextControls
        selectedElement="shape-9"
        activeFloatingModule={{ type: 'shape', data: { id: 'shape-9', fill: '#000' } }}
        canMoveUp
        canMoveDown
        canDuplicate
        handlers={HANDLERS}
        background={background}
        onRemoveUserImage={onRemoveUserImage}
      />
    );
    await vi.waitFor(() => expect(onRemoveUserImage).toHaveBeenCalledWith('user-image-1'));
    expect(onRemoveUserImage).not.toHaveBeenCalledWith('shape-9');
    expect(background.onImageChange).toHaveBeenCalledWith(
      expect.any(File),
      '/api/share/abc/download',
      null
    );
  });

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
        handlers={HANDLERS}
        onRemoveUserImage={vi.fn()}
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
        handlers={HANDLERS}
        onRemoveUserImage={vi.fn()}
        background={controls()}
      />
    );
    expect(screen.queryByText('Als Hintergrund')).toBeNull();
  });
});

describe('Unsplash-Foto', () => {
  const credit = {
    photographer: 'Jane Doe',
    profileUrl: 'https://unsplash.com/@jane?utm_source=gruenerator&utm_medium=referral',
    photoUrl: 'https://unsplash.com/photos/abc?utm_source=gruenerator&utm_medium=referral',
    downloadLocation: 'https://api.unsplash.com/photos/abc/download',
  };
  const hotlink = 'https://images.unsplash.com/photo-abc?ixid=1';

  it('„Als Hintergrund" nimmt den Bildnachweis mit', async () => {
    const background = controls();
    render(
      <ContextControls
        selectedElement="user-image-1"
        activeFloatingModule={{
          type: 'user-image',
          data: { id: 'user-image-1', src: hotlink, fileName: 'foto.jpg', attribution: credit },
        }}
        canMoveUp
        canMoveDown
        canDuplicate
        handlers={HANDLERS}
        background={background}
        onRemoveUserImage={vi.fn()}
      />
    );
    await userEvent.click(screen.getByText('Als Hintergrund'));
    await vi.waitFor(() =>
      expect(background.onImageChange).toHaveBeenCalledWith(expect.any(File), hotlink, credit)
    );
  });

  it('zeigt den Bildnachweis, solange das Hintergrundfoto ausgewählt ist', () => {
    renderBar(PHOTO, controls({ currentImageSrc: hotlink, imageAttribution: credit }));
    expect(screen.getByRole('link', { name: 'Jane Doe' })).toHaveAttribute(
      'href',
      credit.profileUrl
    );
    expect(screen.getByRole('link', { name: 'Unsplash' })).toBeInTheDocument();
  });
});
