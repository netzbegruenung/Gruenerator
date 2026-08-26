import {
  SiBookingdotcom,
  SiBrevo,
  SiCoda,
  SiExpedia,
  SiGooglemaps,
  SiHubspot,
  SiIfttt,
  SiMiro,
  SiNotion,
  SiStatista,
  SiTodoist,
  SiTrivago,
  SiTypeform,
  SiZapier,
  SiZoom,
} from 'react-icons/si';
import { describe, expect, it } from 'vitest';

import { connectorBrandIcon as connectorBrandIconViaSubpath } from '../connectors';

import { connectorBrandIcon, contrastRatio, legibleBrandColor, parseColor } from './connectorBrand';

describe('connectorBrandIcon', () => {
  it('matches a vendor on name or host, case-insensitively', () => {
    expect(connectorBrandIcon('Notion')).not.toBeNull();
    expect(connectorBrandIcon('drive.google.com')).not.toBeNull();
    expect(connectorBrandIcon('HUBSPOT CRM')).not.toBeNull();
  });

  it('draws every vendor the settings directory used to keep its own list for', () => {
    // apps/web McpSection had its own 15-entry copy of this map. It now reads
    // this one, so every title that used to resolve there must still resolve —
    // and to the same mark: an earlier keyword in the merged order winning over
    // the right one would swap a logo silently.
    const settingsDirectory = [
      ['Notion', SiNotion],
      ['Coda', SiCoda],
      ['HubSpot', SiHubspot],
      ['Brevo', SiBrevo],
      ['Statista', SiStatista],
      ['Zapier', SiZapier],
      ['Google Maps', SiGooglemaps],
      ['Typeform', SiTypeform],
      ['Zoom', SiZoom],
      ['Todoist', SiTodoist],
      ['Miro', SiMiro],
      ['IFTTT', SiIfttt],
      ['Booking.com', SiBookingdotcom],
      ['Expedia', SiExpedia],
      ['Trivago', SiTrivago],
    ] as const;
    for (const [title, mark] of settingsDirectory) {
      expect(connectorBrandIcon(title), title).toBe(mark);
    }
  });

  it('is the same function behind the subpath the settings page imports', () => {
    // apps/web reaches it as `@gruenerator/chat/connectors`; a barrel that stops
    // re-exporting is a broken build there and green tests here.
    expect(connectorBrandIconViaSubpath).toBe(connectorBrandIcon);
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

  it('rescues a mark the exact colour of the chip it sits on', () => {
    // The worst input there is: 1:1 against the ground, so the blend has to run
    // deep. It is also the case that would expose a loop which stops short of a
    // full blend — the last step is what makes the exit unconditional.
    for (const [ground, mode] of [
      ['#f2f2f2', 'light'],
      ['#3b3b3b', 'dark'],
    ] as const) {
      expect(ratioOnChip(legibleBrandColor(ground, mode), mode), mode).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back to the label colour for a colour it cannot parse', () => {
    expect(legibleBrandColor('rebeccapurple', 'dark')).toBe('currentColor');
  });
});
