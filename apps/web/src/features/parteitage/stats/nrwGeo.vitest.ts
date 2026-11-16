import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { geoArea, geoMercator, geoPath } from 'd3-geo';
import { describe, expect, it } from 'vitest';

import type { FeatureCollection, Geometry } from 'geojson';

const geo = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../public/geo/nrw-kreise.geo.json'), 'utf8')
) as FeatureCollection<Geometry>;

describe('nrw-kreise.geo.json winding (d3 expects clockwise exterior rings)', () => {
  it('every district is tiny on the sphere', () => {
    for (const f of geo.features) expect(geoArea(f), String(f.properties?.GEN)).toBeLessThan(0.01);
  });
  it('fitted projection gives each district a bbox smaller than the SVG', () => {
    const [w, h] = [420, 440];
    const path = geoPath(geoMercator().fitSize([w, h], geo));
    for (const f of geo.features) {
      const [[x0, y0], [x1, y1]] = path.bounds(f);
      expect(x1 - x0, String(f.properties?.GEN)).toBeLessThan(w);
      expect(y1 - y0).toBeLessThan(h);
    }
  });
});
