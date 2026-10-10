import { describe, expect, it } from 'vitest';

import { getTemplateFormat, ratioLabelFromSize } from './templateFormat';

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

  it('nimmt das Seitenverhältnis einer Grünerator-Vorlage aus ihrem Blueprint', () => {
    const vorlage = (format: string) =>
      getTemplateFormat({
        template_type: 'gruenerator',
        content_data: { canvasId: 'c1', canvasType: 'freeform', format },
      }).formatLabel;
    expect(vorlage('post-portrait-tall')).toBe('Sharepic · 3:4');
    expect(vorlage('post-portrait')).toBe('Sharepic · 4:5');
    // Ein entferntes Format behält die Voreinstellung.
    expect(vorlage('story')).toBe('Sharepic · 4:5');
  });

  it('lässt Tags das Seitenverhältnis überschreiben', () => {
    const format = getTemplateFormat({ template_type: 'sharepic', tags: ['Hochformat'] });
    expect(format.formatLabel).toBe('Sharepic · 4:5');
  });

  it('leitet das Werkzeug aus der URL ab, nicht aus dem Wortlaut', () => {
    expect(getTemplateFormat({ external_url: 'https://canva.com.evil.test/x' }).tool).toBe('Link');
    expect(getTemplateFormat({ download_url: '/files/a.pdf' }).tool).toBe('Download');
  });

  it('misst das Verhältnis nur, wo sonst geraten würde', () => {
    expect(
      getTemplateFormat(
        { template_type: 'canva', external_url: 'https://www.canva.com/design/ABC/view' },
        '4:5'
      ).formatLabel
    ).toBe('4:5');
    expect(getTemplateFormat({ template_type: 'story' }, '4:5').formatLabel).toBe('Story · 9:16');
    expect(
      getTemplateFormat(
        {
          template_type: 'canva',
          tags: ['quadratisch'],
          external_url: 'https://www.canva.com/design/ABC/view',
        },
        '4:5'
      ).formatLabel
    ).toBe('1:1');
  });

  it('rundet Bildmaße auf das nächste Standardformat', () => {
    expect(ratioLabelFromSize(1080, 1350)).toBe('4:5');
    expect(ratioLabelFromSize(1080, 1080)).toBe('1:1');
    expect(ratioLabelFromSize(1080, 1920)).toBe('9:16');
    expect(ratioLabelFromSize(1200, 630)).toBe('1.9:1');
    expect(ratioLabelFromSize(0, 10)).toBeNull();
  });
});
