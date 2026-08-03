import { describe, it, expect, vi, beforeEach } from 'vitest';

const generateSharepicForChat = vi.fn();

vi.mock('../../../services/chat/sharepicGenerationService.js', () => ({
  generateSharepicForChat: (...args: unknown[]) => generateSharepicForChat(...args),
}));

const { generateSharepicVariants } = await import('./sharepicVariantHelpers.js');

/**
 * Every sharepic prompt template has a `{{details}}` slot, and outside
 * refinements it was always empty — the generator got `Thema: <topic>\nDetails:`
 * and had to invent the substance. Documents, sheets and presentations have had
 * the thread transcript plus carried sources since runCreateTurn; the sharepic
 * lane went around it.
 */
describe('generateSharepicVariants — background', () => {
  beforeEach(() => {
    generateSharepicForChat.mockReset();
    generateSharepicForChat.mockResolvedValue({ type: 'dreizeilen', line1: 'a' });
  });

  const req = {} as Parameters<typeof generateSharepicVariants>[0]['req'];

  const bodyOf = (): Record<string, unknown> =>
    generateSharepicForChat.mock.calls[0]?.[2] as Record<string, unknown>;

  it('reicht den Hintergrund in das details-Feld durch', async () => {
    await generateSharepicVariants({
      req,
      text: 'Klimaanlagen in Schulen als Hitzeschutz',
      preferredVariant: 'dreizeilen',
      background: 'assistant: Klimaanlagen senken die Innenraumtemperatur um bis zu 8 Grad.',
    });
    expect(bodyOf().details).toContain('8 Grad');
    expect(bodyOf().thema).toContain('Klimaanlagen');
  });

  it('lässt details weg, wenn es keinen Hintergrund gibt', async () => {
    await generateSharepicVariants({
      req,
      text: 'Radwegeausbau',
      preferredVariant: 'dreizeilen',
    });
    expect(bodyOf()).not.toHaveProperty('details');
  });

  it('überschreibt die Edit-Anweisung einer Verfeinerung nicht', async () => {
    // Beim Refinement trägt `details` die Änderungsanweisung plus den alten
    // Text — der Hintergrund darf da nicht hineinregieren.
    await generateSharepicVariants({
      req,
      text: 'egal',
      background: 'assistant: irgendein Verlauf',
      refinement: {
        instruction: 'kürzer',
        prior: {
          canvasType: 'dreizeilen',
          props: { line1: 'Jetzt', line2: 'handeln', line3: 'für morgen' },
        },
      },
    });
    expect(bodyOf().details).toContain('kürzer');
    expect(bodyOf().details).not.toContain('irgendein Verlauf');
  });
});
