import {
  framedPhotoRect,
  panOfFramedPhoto,
  photoRectAround,
  type Rect,
} from '@ggraphic/editor/utils/coverFit';
import { frameForAspect } from '@ggraphic/editor/utils/cropAspect';
import {
  clampPointToStraightPhoto,
  clampStraighten,
  frameForAspectOnStraightPhoto,
  minCoverScale,
  minStraightenZoom,
  panOfStraightPhoto,
  panStraightPhoto,
  rotatedExtent,
  straightDrawOf,
  straightFramedPhoto,
  straightPhotoCovers,
  straightenPhoto,
  straightenWindowPhoto,
  windowPhotoOfStraight,
  zoomStraightPhoto,
} from '@ggraphic/editor/utils/straighten';
import { describe, expect, it } from 'vitest';

const page: Rect = { x: 0, y: 0, width: 1080, height: 1350 };
const landscape = { width: 1200, height: 800 };

/** Deterministischer Zufall, damit ein roter Lauf sich wiederholen lässt. */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('Winkel', () => {
  it('rundet auf ganze Grad und hält −45 … 45', () => {
    expect(clampStraighten(12.4)).toBe(12);
    expect(clampStraighten(-60)).toBe(-45);
    expect(clampStraighten(99)).toBe(45);
    expect(Object.is(clampStraighten(-0.2), 0)).toBe(true);
    expect(clampStraighten(Number.NaN)).toBe(0);
  });
});

describe('Mindestzoom je Winkel', () => {
  it('ist bei 0° genau das ungedrehte Decken', () => {
    expect(rotatedExtent(page, 0)).toEqual({ width: 1080, height: 1350 });
    expect(minStraightenZoom(landscape, page, 0)).toBe(1);
  });

  it('wächst mit dem Betrag des Winkels, symmetrisch', () => {
    const zooms = [0, 5, 15, 30, 45].map((deg) => minStraightenZoom(landscape, page, deg));
    for (let i = 1; i < zooms.length; i++) expect(zooms[i]!).toBeGreaterThan(zooms[i - 1]!);
    for (const deg of [5, 15, 30, 45]) {
      expect(minStraightenZoom(landscape, page, -deg)).toBeCloseTo(
        minStraightenZoom(landscape, page, deg),
        12
      );
    }
  });

  it('bei ±45° deckt das Foto die Diagonale des Rahmens in beiden Achsen', () => {
    const square = { width: 100, height: 100 };
    const extent = rotatedExtent(square, 45);
    expect(extent.width).toBeCloseTo(100 * Math.SQRT2, 10);
    expect(extent.height).toBeCloseTo(100 * Math.SQRT2, 10);
    expect(minCoverScale({ width: 100, height: 100 }, square, -45)).toBeCloseTo(Math.SQRT2, 10);
  });

  it('ist eng: knapp darunter bleibt eine Ecke frei', () => {
    for (const deg of [-45, -17, 3, 30, 45]) {
      const scale = minCoverScale(landscape, page, deg);
      const centred = (s: number): Rect => ({
        x: 540 - (landscape.width * s) / 2,
        y: 675 - (landscape.height * s) / 2,
        width: landscape.width * s,
        height: landscape.height * s,
      });
      expect(straightPhotoCovers(centred(scale), deg, page, 1e-6)).toBe(true);
      expect(straightPhotoCovers(centred(scale * 0.995), deg, page, 1e-6)).toBe(false);
    }
  });

  it('extreme Seitenverhältnisse: ein Band im Hochformat-Foto und umgekehrt', () => {
    const band: Rect = { x: 0, y: 0, width: 2000, height: 40 };
    const tall = { width: 300, height: 4000 };
    for (const deg of [1, 20, 45, -45]) {
      const photo = straightenPhoto(photoRectAround(tall, band), deg, band);
      expect(straightPhotoCovers(photo, deg, band, 1e-6)).toBe(true);
    }
    const sliver: Rect = { x: 0, y: 0, width: 30, height: 3000 };
    const wide = { width: 6000, height: 200 };
    for (const deg of [1, 20, 45, -45]) {
      const photo = straightenPhoto(photoRectAround(wide, sliver), deg, sliver);
      expect(straightPhotoCovers(photo, deg, sliver, 1e-6)).toBe(true);
    }
  });
});

describe('straightenPhoto', () => {
  it('lässt ein deckendes Foto bei 0° unverändert (dasselbe Objekt)', () => {
    const photo = photoRectAround(landscape, { x: -100, y: 0, width: 1080, height: 1350 });
    expect(straightenPhoto(photo, 0, page)).toBe(photo);
  });

  it('vergrößert um die Mitte, solange nichts zu verschieben ist', () => {
    const photo = photoRectAround(landscape, page);
    const turned = straightenPhoto(photo, 20, page);
    expect(turned.width / turned.height).toBeCloseTo(1.5, 10);
    expect(turned.x + turned.width / 2).toBeCloseTo(540, 9);
    expect(turned.y + turned.height / 2).toBeCloseTo(675, 9);
    expect(straightPhotoCovers(turned, 20, page, 1e-6)).toBe(true);
  });

  it('zieht eine zu weit verschobene Mitte zurück, bis das Foto deckt', () => {
    const photo = photoRectAround(landscape, { x: -500, y: 0, width: 1080, height: 1350 });
    const turned = straightenPhoto(photo, -30, page);
    expect(straightPhotoCovers(turned, -30, page, 1e-6)).toBe(true);
  });
});

describe('Pan mit Drehung', () => {
  it('hält jeden Zug innerhalb der Deckung', () => {
    const photo = zoomStraightPhoto(
      straightenPhoto(photoRectAround(landscape, page), 25, page),
      1.4,
      25,
      page
    );
    for (const [dx, dy] of [
      [5000, 0],
      [-5000, 0],
      [0, 5000],
      [0, -5000],
      [3000, -3000],
    ] as const) {
      const moved = panStraightPhoto(photo, 25, page, dx, dy);
      expect(straightPhotoCovers(moved, 25, page, 1e-6)).toBe(true);
      expect(moved.width).toBe(photo.width);
    }
  });

  it('lässt einen kleinen Zug ganz durch', () => {
    const photo = zoomStraightPhoto(
      straightenPhoto(photoRectAround(landscape, page), 10, page),
      2,
      10,
      page
    );
    const moved = panStraightPhoto(photo, 10, page, 12, -7);
    expect(moved.x - photo.x).toBeCloseTo(12, 9);
    expect(moved.y - photo.y).toBeCloseTo(-7, 9);
  });

  it('bei 0° ist die Grenze die alte: bis zur Kante, nicht weiter', () => {
    const photo = photoRectAround(landscape, page);
    const moved = panStraightPhoto(photo, 0, page, 5000, 0);
    expect(moved.x).toBeCloseTo(0, 9);
  });

  it('der Zoom hält den Mindestzoom für den Winkel', () => {
    const photo = straightenPhoto(photoRectAround(landscape, page), 30, page);
    const out = zoomStraightPhoto(photo, 0.2, 30, page);
    expect(out.width).toBeCloseTo(photo.width, 9);
    expect(straightPhotoCovers(out, 30, page, 1e-6)).toBe(true);
  });
});

describe('Hintergrund: Fenster-Zoom setzt auf dem Mindestzoom auf', () => {
  const windowAt = (scale: number): Rect => ({
    x: 540 - (1080 * scale) / 2,
    y: 675 - (1350 * scale) / 2,
    width: 1080 * scale,
    height: 1350 * scale,
  });

  it('ist bei 0° das unveränderte Fenster-Foto', () => {
    const photo = photoRectAround(landscape, windowAt(1.4));
    expect(straightenWindowPhoto(landscape, photo, 0, page)).toBe(photo);
    expect(windowPhotoOfStraight(landscape, photo, 0, page)).toBe(photo);
  });

  it('jeder Zoom-Wert ab 1 ändert das Bild: kein toter Bereich', () => {
    for (const deg of [-45, -10, 5, 30]) {
      const floor = minStraightenZoom(landscape, page, deg);
      const widths = [1, 1.1, 1.3, 1.6, 3].map(
        (scale) =>
          straightenWindowPhoto(landscape, photoRectAround(landscape, windowAt(scale)), deg, page)
            .width
      );
      const atOne = widths[0]!;
      expect(atOne).toBeCloseTo(photoRectAround(landscape, page).width * floor, 6);
      [1, 1.1, 1.3, 1.6, 3].forEach((scale, i) => {
        expect(widths[i]!).toBeCloseTo(atOne * scale, 6);
      });
    }
  });

  it('Umkehrung: der gespeicherte Zoom ergibt wieder dasselbe Foto', () => {
    const photo = photoRectAround(landscape, windowAt(1.2));
    const straight = straightenWindowPhoto(landscape, photo, 20, page);
    const back = windowPhotoOfStraight(landscape, straight, 20, page);
    const again = straightenWindowPhoto(landscape, back, 20, page);
    expect(again.width).toBeCloseTo(straight.width, 9);
    expect(again.x).toBeCloseTo(straight.x, 9);
    expect(again.y).toBeCloseTo(straight.y, 9);
  });
});

describe('eigenes Bild: Anteil in den Achsen des gedrehten Fotos', () => {
  const frame = { width: 600, height: 400 };

  it('ist bei 0° genau framedPhotoRect', () => {
    const pan = { x: 0.3, y: -0.7 };
    expect(straightFramedPhoto(landscape, frame, pan, 1.5, 0)).toEqual(
      framedPhotoRect(landscape, frame, pan, 1.5)
    );
    const photo = framedPhotoRect(landscape, frame, pan, 1.5);
    expect(panOfStraightPhoto(photo, 0, frame)).toEqual(panOfFramedPhoto(photo, frame));
  });

  it('Umkehrung: der Anteil führt auf dasselbe Foto zurück', () => {
    for (const deg of [-45, -12, 7, 45]) {
      const pan = { x: 0.6, y: -0.4 };
      const photo = straightFramedPhoto(landscape, frame, pan, 1.3, deg);
      const back = panOfStraightPhoto(photo, deg, frame, pan);
      expect(back.x).toBeCloseTo(pan.x, 9);
      expect(back.y).toBeCloseTo(pan.y, 9);
      // Auch ohne den alten Anteil: dasselbe Foto.
      const again = straightFramedPhoto(
        landscape,
        frame,
        panOfStraightPhoto(photo, deg, frame),
        1.3,
        deg
      );
      expect(again.x).toBeCloseTo(photo.x, 6);
      expect(again.y).toBeCloseTo(photo.y, 6);
    }
  });

  it('Zurückdrehen bringt denselben Ausschnitt', () => {
    const pan = { x: -0.5, y: 0.25 };
    expect(straightFramedPhoto(landscape, frame, pan, 1.2, 0)).toEqual(
      framedPhotoRect(landscape, frame, pan, 1.2)
    );
    const turned = straightFramedPhoto(landscape, frame, pan, 1.2, 30);
    expect(panOfStraightPhoto(turned, 30, frame).x).toBeCloseTo(-0.5, 9);
  });
});

describe('Eigenschaft: das gedrehte Foto deckt den Rahmen immer', () => {
  it('über Rahmen, Seitenverhältnisse, Winkel, Zoom und Pan', () => {
    const next = random(4711);
    for (let i = 0; i < 4000; i++) {
      const frame: Rect = {
        x: (next() - 0.5) * 400,
        y: (next() - 0.5) * 400,
        width: 5 + next() * (next() < 0.2 ? 5000 : 1200),
        height: 5 + next() * (next() < 0.2 ? 5000 : 1200),
      };
      const natural = {
        width: 10 + next() * (next() < 0.2 ? 8000 : 3000),
        height: 10 + next() * (next() < 0.2 ? 8000 : 3000),
      };
      const deg = Math.round((next() - 0.5) * 90);
      const tol = 1e-6 * Math.max(frame.width, frame.height);

      // Hintergrund: ein beliebiges Fenster, auch verschoben und gezoomt.
      const window: Rect = {
        x: frame.x + (next() - 0.5) * frame.width,
        y: frame.y + (next() - 0.5) * frame.height,
        width: frame.width * (1 + next() * 2),
        height: frame.height * (1 + next() * 2),
      };
      const photo = straightenWindowPhoto(natural, photoRectAround(natural, window), deg, frame);
      expect(straightPhotoCovers(photo, deg, frame, tol)).toBe(true);
      expect(
        straightPhotoCovers(
          straightenPhoto(photoRectAround(natural, window), deg, frame),
          deg,
          frame,
          tol
        )
      ).toBe(true);
      const panned = panStraightPhoto(
        photo,
        deg,
        frame,
        (next() - 0.5) * 1e4,
        (next() - 0.5) * 1e4
      );
      expect(straightPhotoCovers(panned, deg, frame, tol)).toBe(true);
      const zoomed = zoomStraightPhoto(panned, 0.3 + next() * 3, deg, frame);
      expect(straightPhotoCovers(zoomed, deg, frame, tol)).toBe(true);

      // Eigenes Bild: Anteil −1 … 1 und Zoom ≥ 1.
      const size = { width: frame.width, height: frame.height };
      const own = straightFramedPhoto(
        natural,
        size,
        { x: next() * 2 - 1, y: next() * 2 - 1 },
        1 + next() * 3,
        deg
      );
      expect(straightPhotoCovers(own, deg, { x: 0, y: 0, ...size }, tol)).toBe(true);
    }
  });
});

describe('Seitenverhältnis auf gedrehtem Foto', () => {
  it('ist bei 0° dasselbe wie frameForAspect', () => {
    const photo = { x: -100, y: -50, width: 900, height: 600 };
    const frame = { x: 0, y: 0, width: 600, height: 400 };
    const a = frameForAspectOnStraightPhoto(frame, photo, 0, 1);
    const b = frameForAspect(frame, photo, 1);
    expect(a.width).toBeCloseTo(b.width, 9);
    expect(a.height).toBeCloseTo(b.height, 9);
    expect(a.x).toBeCloseTo(b.x, 9);
    expect(a.y).toBeCloseTo(b.y, 9);
  });

  it('liegt gedreht ganz auf dem Foto und ist maximal', () => {
    const photo = { x: -100, y: -50, width: 900, height: 600 };
    const offCentre = { x: 50, y: 20, width: 500, height: 400 };
    const centred = { x: 150, y: 50, width: 500, height: 400 };
    const grown = (r: Rect, f: number): Rect => ({
      x: r.x - (r.width * (f - 1)) / 2,
      y: r.y - (r.height * (f - 1)) / 2,
      width: r.width * f,
      height: r.height * f,
    });
    for (const deg of [-45, -20, 15, 45]) {
      for (const ratio of [1, 9 / 16, 16 / 9]) {
        const box = frameForAspectOnStraightPhoto(offCentre, photo, deg, ratio);
        expect(box.width / box.height).toBeCloseTo(ratio, 9);
        expect(straightPhotoCovers(photo, deg, box, 1e-6)).toBe(true);
        const middle = frameForAspectOnStraightPhoto(centred, photo, deg, ratio);
        expect(straightPhotoCovers(photo, deg, middle, 1e-6)).toBe(true);
        expect(straightPhotoCovers(photo, deg, grown(middle, 1.01), 1e-6)).toBe(false);
      }
    }
  });
});

describe('Zeichnen und Griffe', () => {
  it('spiegelt die Lage und kehrt den Winkel je gespiegelter Achse um', () => {
    const photo = { x: -50, y: -20, width: 400, height: 300 };
    const box = { x: 0, y: 0, width: 200, height: 200 };
    expect(straightDrawOf(photo, 10, box, null)).toEqual({
      x: 150,
      y: 130,
      width: 400,
      height: 300,
      rotation: 10,
    });
    expect(straightDrawOf(photo, 10, box, { x: true })).toMatchObject({
      x: 50,
      y: 130,
      rotation: -10,
    });
    expect(straightDrawOf(photo, 10, box, { y: true })).toMatchObject({
      x: 150,
      y: 70,
      rotation: -10,
    });
    expect(straightDrawOf(photo, 10, box, { x: true, y: true })).toMatchObject({
      x: 50,
      y: 70,
      rotation: 10,
    });
  });

  it('ein Griff außerhalb des gedrehten Fotos landet auf seinem Rand', () => {
    const photo = { x: 0, y: 0, width: 400, height: 200 };
    const held = clampPointToStraightPhoto({ x: 1000, y: 100 }, photo, 30);
    expect(straightPhotoCovers(photo, 30, { ...held, width: 0, height: 0 }, 1e-6)).toBe(true);
    const inside = { x: 210, y: 90 };
    expect(clampPointToStraightPhoto(inside, photo, 30)).toBe(inside);
  });
});
