import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithProviders, screen } from '../../test-utils';

import FeedbackWidget from './FeedbackWidget';

// Der Screenshot läuft beim Öffnen im Hintergrund; in jsdom gibt es nichts zu
// zeichnen, und der echte Aufruf würde den Test nur mit Warnungen fluten.
vi.mock('modern-screenshot', () => ({ domToJpeg: () => Promise.resolve(null) }));

const originalWidth = window.innerWidth;

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
}

afterEach(() => setViewportWidth(originalWidth));

describe('FeedbackWidget', () => {
  it('zeigt die Textpille auf breiten Schirmen', () => {
    setViewportWidth(1280);
    renderWithProviders(<FeedbackWidget variant="text" />);
    expect(screen.getByRole('button', { name: /^Feedback$/ })).toBeInTheDocument();
  });

  // Tablets und Handys: die Pille überdeckt dort Bedienelemente am Rand — etwa
  // den Stop-Knopf des Chat-Composers —, ohne dass Platz zum Ausweichen bliebe.
  it('schrumpft die Textpille auf Tablet-Breite zum Icon', () => {
    setViewportWidth(820);
    renderWithProviders(<FeedbackWidget variant="text" />);
    expect(screen.getByRole('button', { name: 'Feedback geben' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Feedback$/ })).not.toBeInTheDocument();
  });

  it('lässt die ausdrückliche Icon-Wahl unangetastet', () => {
    setViewportWidth(1280);
    renderWithProviders(<FeedbackWidget variant="icon" />);
    expect(screen.getByRole('button', { name: 'Feedback geben' })).toBeInTheDocument();
  });

  // Der Knopf schwebt auch über dem Chat — ohne diesen Satz tippen Leute ihn
  // an, als wäre der Dialog ein weiteres Chatfenster.
  it('sagt im Dialog, dass die Nachricht an die Entwicklung geht und keine Antwort kommt', async () => {
    setViewportWidth(1280);
    const { user } = renderWithProviders(<FeedbackWidget variant="text" />);

    await user.click(screen.getByRole('button', { name: /^Feedback$/ }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Feedback an die Entwicklung');
    expect(dialog).toHaveTextContent(/kein Chat/);
    expect(dialog).toHaveTextContent(/an die Entwicklung des Grünerators/);
    expect(dialog).toHaveTextContent(/keine Antwort/);
  });
});
