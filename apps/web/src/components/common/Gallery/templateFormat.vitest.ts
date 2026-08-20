import { describe, expect, it } from 'vitest';

import { getTemplateFormat } from './templateFormat';

describe('getTemplateFormat', () => {
  it('nennt den Typ nicht, wenn er nur das Werkzeug wiederholt', () => {
    // `template_type` ist für die Gallerie-Mehrheit die Quelle, nicht das Format.
    // Ohne diese Regel steht neben dem CANVA-Abzeichen noch einmal "Canva · 1:1".
    const format = getTemplateFormat({
      template_type: 'canva',
      external_url: 'https://www.canva.com/design/ABC/view',
    });
    expect(format.tool).toBe('Canva');
    expect(format.formatLabel).toBe('1:1');
  });

  it('lässt den nichtssagenden Standardtyp weg', () => {
    expect(getTemplateFormat({}).formatLabel).toBe('1:1');
  });

  it('nennt den Typ, wenn er etwas Eigenes sagt', () => {
    expect(getTemplateFormat({ template_type: 'story' }).formatLabel).toBe('Story · 9:16');
    expect(getTemplateFormat({ template_type: 'flyer' }).formatLabel).toBe('Flyer · A5');
  });

  it('trennt Grünerator-Vorlagen vom Werkzeugnamen', () => {
    const format = getTemplateFormat({ template_type: 'gruenerator' });
    expect(format.tool).toBe('Grünerator');
    expect(format.formatLabel).toBe('Sharepic · 4:5');
  });

  it('lässt Tags das Seitenverhältnis überschreiben', () => {
    const format = getTemplateFormat({ template_type: 'sharepic', tags: ['Hochformat'] });
    expect(format.formatLabel).toBe('Sharepic · 4:5');
  });

  it('leitet das Werkzeug aus der URL ab, nicht aus dem Wortlaut', () => {
    expect(getTemplateFormat({ external_url: 'https://canva.com.evil.test/x' }).tool).toBe('Link');
    expect(getTemplateFormat({ download_url: '/files/a.pdf' }).tool).toBe('Download');
  });
});
