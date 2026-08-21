import { afterEach, describe, expect, it } from 'vitest';

import { renderWithProviders, screen } from '../../test-utils';

import FeedbackWidget from './FeedbackWidget';

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
});
