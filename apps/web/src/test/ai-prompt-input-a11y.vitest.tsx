// `AIPromptInput`s Aktionsknopf hat vier Zweige, und zwei davon trugen keinen
// zugänglichen Namen (#3474): der normale Absenden-Zweig (Text getippt, bereit)
// und der Ladezweig, in dem nur ein Spinner-`<span>` im Knopf steht. Beide
// waren damit für Screenreader namenlos — WCAG 4.1.2. Der Knopf wird EINMAL
// gebaut und von beiden Varianten gerendert, also deckt ein Satz Prüfungen
// `card` und `pill` gemeinsam ab.
//
// Der Test liegt hier und nicht in `packages/ui`, weil das Paket keine
// Test-Lane hat (nur `lint` und `typecheck`) — dasselbe Vorgehen wie in
// `toaster-theme.vitest.tsx`.
import { AIPromptInput } from '@gruenerator/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../test-utils';

const noop = () => {};

/** `isEmpty` ist `value.trim().length < 3` — ab drei Zeichen erscheint der Absenden-Knopf. */
const TYPED = 'Eine Pressemitteilung zum Radentscheid';

function renderInput(props: Partial<React.ComponentProps<typeof AIPromptInput>> = {}) {
  return render(<AIPromptInput value={TYPED} onChange={noop} onSubmit={noop} {...props} />);
}

describe('AIPromptInput — Name des Aktionsknopfs', () => {
  it('benennt den Absenden-Knopf, sobald Text eingegeben ist', () => {
    renderInput();
    // Genau die Abfrage, die im Issue nichts fand.
    expect(screen.getByRole('button', { name: 'Absenden' })).toBeInTheDocument();
  });

  it('benennt den Knopf auch im Ladezustand und meldet ihn als beschäftigt', () => {
    renderInput({ isLoading: true });
    const button = screen.getByRole('button', { name: 'Absenden' });
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(button).toBeDisabled();
  });

  it('benennt den Knopf in der Pill-Variante ebenso', () => {
    renderInput({ variant: 'pill' });
    expect(screen.getByRole('button', { name: 'Absenden' })).toBeInTheDocument();
  });

  it('lässt bei leerer Eingabe den benannten Mikrofon-Knopf stehen', () => {
    renderInput({ value: '' });
    expect(screen.getByRole('button', { name: 'Spracheingabe' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Absenden' })).not.toBeInTheDocument();
  });

  it('hat keinen Knopf ohne Namen — in keinem der gerenderten Zustände', () => {
    for (const props of [{}, { isLoading: true }, { value: '' }, { variant: 'pill' as const }]) {
      const { unmount } = renderInput(props);
      for (const button of screen.getAllByRole('button')) {
        expect(button).toHaveAccessibleName();
      }
      unmount();
    }
  });
});

describe('AIPromptInput — axe', () => {
  it('meldet keine Verstöße mit eingegebenem Text', async () => {
    const { container } = renderInput();
    expect(await axe(container)).toHaveNoViolations();
  });

  it('meldet keine Verstöße im Ladezustand', async () => {
    const { container } = renderInput({ isLoading: true });
    expect(await axe(container)).toHaveNoViolations();
  });
});
