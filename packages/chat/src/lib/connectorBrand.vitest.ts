import { describe, expect, it } from 'vitest';

import { connectorBrandIcon, contrastRatio, legibleBrandColor, parseColor } from './connectorBrand';

describe('connectorBrandIcon', () => {
  it('matches a vendor on name or host, case-insensitively', () => {
    expect(connectorBrandIcon('Notion')).not.toBeNull();
    expect(connectorBrandIcon('drive.google.com')).not.toBeNull();
    expect(connectorBrandIcon('HUBSPOT CRM')).not.toBeNull();
  });

  it('covers the vendors the settings directory also draws', () => {
    // These were in apps/web McpSection but missing here, so the composer drew a
    // generic plug for a service the settings page showed a logo for.
    for (const name of ['Coda', 'Typeform', 'Zoom', 'IFTTT', 'Booking.com', 'Expedia']) {
      expect(connectorBrandIcon(name), name).not.toBeNull();
    }
  });

  it('returns null for an unknown service so the caller can fall back', () => {
    expect(connectorBrandIcon('Sally')).toBeNull();
  });
});

/** Re-derives the ratio the component will actually render at. */
function ratioOnChip(color: string, mode: 'light' | 'dark'): number {
  const rgbFn = /^rgb\((\d+) (\d+) (\d+)\)$/.exec(color);
  const rgb: [number, number, number] | null = rgbFn
    ? [Number(rgbFn[1]), Number(rgbFn[2]), Number(rgbFn[3])]
    : parseColor(color);
  if (!rgb) throw new Error(`not a measurable colour: ${color}`);
  return contrastRatio(rgb, mode === 'dark' ? [59, 59, 59] : [242, 242, 242]);
}

describe('legibleBrandColor', () => {
  it('leaves a brand colour that already clears 3:1 untouched', () => {
    // Zapier orange: 3.32:1 dark, 3.01:1 light.
    expect(legibleBrandColor('#FF4A00', 'dark')).toBe('#FF4A00');
    expect(legibleBrandColor('#FF4A00', 'light')).toBe('#FF4A00');
  });

  it('lifts a near-black mark off the dark chip and leaves the light one alone', () => {
    // Notion #0F0F0F is an invisible blob on the dark chip (1.71:1) but the
    // strongest mark there is on the light one (17.1:1).
    expect(ratioOnChip(legibleBrandColor('#0F0F0F', 'dark'), 'dark')).toBeGreaterThanOrEqual(3);
    expect(legibleBrandColor('#0F0F0F', 'light')).toBe('#0F0F0F');
  });

  it('darkens a pale mark on the light chip and leaves the dark one alone', () => {
    // HubSpot #FF7A59: 4.36:1 dark, 2.29:1 light.
    expect(ratioOnChip(legibleBrandColor('#FF7A59', 'light'), 'light')).toBeGreaterThanOrEqual(3);
    expect(legibleBrandColor('#FF7A59', 'dark')).toBe('#FF7A59');
  });

  it('rescues the hsl fallback every unregistered service gets', () => {
    // mcpBrandColor invents `hsl(H 52% 45%)`. It misses the floor at 197 of 360
    // hues on the dark chip and 152 on the light one, so the path every unknown
    // connector takes fails more often than it passes. Whether a given hue got
    // rewritten is not the assertion — that it ends up visible is.
    for (let hue = 0; hue < 360; hue += 15) {
      const input = `hsl(${hue} 52% 45%)`;
      for (const mode of ['light', 'dark'] as const) {
        const out = legibleBrandColor(input, mode);
        expect(out, `hue ${hue} ${mode}`).not.toBe('currentColor');
        expect(ratioOnChip(out, mode), `hue ${hue} ${mode}`).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('clears the floor for every colour in the connector registry', () => {
    const registry = ['#0F0F0F', '#F46A54', '#4F46E5', '#FF7A59', '#000000', '#003580', '#12B5A5'];
    for (const c of registry) {
      for (const mode of ['light', 'dark'] as const) {
        expect(
          ratioOnChip(legibleBrandColor(c, mode), mode),
          `${c} ${mode}`
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('falls back to the label colour for a colour it cannot parse', () => {
    expect(legibleBrandColor('rebeccapurple', 'dark')).toBe('currentColor');
  });
});
