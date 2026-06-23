import { describe, it, expect } from 'vitest';

import { ensureHtml, promoteLeadingBoldToHeading } from './contentNormalization.js';

describe('promoteLeadingBoldToHeading', () => {
  it('promotes a leading bold-only paragraph to <h1>', () => {
    expect(promoteLeadingBoldToHeading('<p><strong>PRESSEMITTEILUNG</strong></p><p>Body</p>')).toBe(
      '<h1>PRESSEMITTEILUNG</h1><p>Body</p>'
    );
  });

  it('handles <b> as well as <strong>, and <p> attributes', () => {
    expect(promoteLeadingBoldToHeading('<p class="x"><b>Schlagzeile</b></p><p>Body</p>')).toBe(
      '<h1>Schlagzeile</h1><p>Body</p>'
    );
  });

  it('leaves content untouched when a real heading already exists', () => {
    const html = '<h1>Titel</h1><p><strong>x</strong></p>';
    expect(promoteLeadingBoldToHeading(html)).toBe(html);
  });

  it('does NOT promote bold that is only part of a sentence', () => {
    const html = '<p><strong>PM</strong> Entlastung folgt hier</p>';
    expect(promoteLeadingBoldToHeading(html)).toBe(html);
  });

  it('does NOT promote on mismatched bold tags', () => {
    const html = '<p><strong>x</b></p>';
    expect(promoteLeadingBoldToHeading(html)).toBe(html);
  });

  it('does NOT promote an empty bold run', () => {
    const html = '<p><strong>  </strong></p><p>Body</p>';
    expect(promoteLeadingBoldToHeading(html)).toBe(html);
  });
});

describe('ensureHtml', () => {
  it('promotes a faux-heading in already-HTML content', () => {
    expect(ensureHtml('<p><strong>Schlagzeile</strong></p><p>Body</p>')).toBe(
      '<h1>Schlagzeile</h1><p>Body</p>'
    );
  });

  it('returns empty string for blank input', () => {
    expect(ensureHtml('   ')).toBe('');
  });
});
