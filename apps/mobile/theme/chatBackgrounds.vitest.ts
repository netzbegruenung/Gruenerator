import { chatBackgroundsFor } from '@gruenerator/shared/settings';
import { describe, expect, it } from 'vitest';

import {
  CHAT_BACKGROUND_COLORS,
  CHAT_BACKGROUND_MESHES,
  chatBackgroundMesh,
} from './chatBackgrounds';

/**
 * Two tables describe the same presets from different angles — the shared list
 * says which exist, this file says how each is drawn — and nothing in the type
 * system ties a preset to *a* rendering. A preset with neither a colour nor a
 * mesh paints nothing at all and looks exactly like "Neutral", which is the
 * failure these tests exist for: it is invisible, and it is silent.
 */
describe('mobile chat backgrounds', () => {
  const mobilePresets = chatBackgroundsFor('mobile');

  it('draws every preset the app offers, as either a glow or a mesh', () => {
    for (const preset of mobilePresets) {
      if (preset.key === 'neutral') continue; // paints nothing on purpose
      const drawn = CHAT_BACKGROUND_COLORS[preset.key] !== null || chatBackgroundMesh(preset.key);
      expect(drawn, `${preset.key} has neither a colour nor a mesh`).toBeTruthy();
    }
  });

  it('never gives a preset both a flat colour and a mesh', () => {
    for (const key of Object.keys(CHAT_BACKGROUND_MESHES)) {
      expect(CHAT_BACKGROUND_COLORS[key as keyof typeof CHAT_BACKGROUND_COLORS]).toBeNull();
    }
  });

  it('offers every mesh it defines', () => {
    const offered = mobilePresets.map((preset) => preset.key);
    for (const key of Object.keys(CHAT_BACKGROUND_MESHES)) {
      expect(offered).toContain(key);
    }
  });
});

/**
 * The layer tables are transcribed by hand from CSS, so these guard the shape
 * of that transcription rather than any particular value — a stop order flipped
 * or an alpha typed as a percentage would still render *something*, just not
 * the design.
 */
describe('mesh layers', () => {
  const meshes = Object.entries(CHAT_BACKGROUND_MESHES);

  it('fades every cloud to nothing', () => {
    for (const [key, mesh] of meshes) {
      for (const layer of mesh!.layers) {
        const last = layer.stops[layer.stops.length - 1];
        expect(last?.opacity, `${key}/${layer.color} does not reach zero`).toBe(0);
      }
    }
  });

  it('orders stops outward and keeps alphas in 0…1', () => {
    for (const [key, mesh] of meshes) {
      for (const layer of mesh!.layers) {
        const offsets = layer.stops.map((stop) => stop.offset);
        expect(offsets, `${key}/${layer.color}`).toEqual([...offsets].sort((a, b) => a - b));
        for (const stop of layer.stops) {
          expect(stop.opacity).toBeGreaterThanOrEqual(0);
          expect(stop.opacity).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('gives each mesh an opaque base', () => {
    for (const [key, mesh] of meshes) {
      expect(mesh!.base, key).toMatch(/^#[0-9A-F]{6}$/i);
    }
  });
});
