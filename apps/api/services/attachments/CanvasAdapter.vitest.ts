import { describe, expect, it, vi } from 'vitest';

import { canvasAdapter } from './CanvasAdapter.js';

import type { ImageAttachment } from './types.js';

const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

/**
 * Der Bug lief ueber diesen Adapter: das AI-Sharepic reichte ein 5,5-MB-JPEG
 * als 7,4-MB-Data-URL herein. Kleine Fixtures haetten ihn nie gezeigt — die
 * Groesse gehoert in den Test.
 */
const HUGE_BYTES = Buffer.alloc(5_542_113, 0x42);

describe('CanvasAdapter.convertToBuffer', () => {
  it('nimmt Rohbytes ohne base64-Umweg', () => {
    const attachment: ImageAttachment = {
      type: 'image/jpeg',
      bytes: JPEG_BYTES,
      name: 'ai.jpg',
    };

    const file = canvasAdapter.convertToBuffer(attachment);

    expect(file.buffer).toBe(JPEG_BYTES);
    expect(file.size).toBe(JPEG_BYTES.length);
    expect(file.mimetype).toBe('image/jpeg');
  });

  it('dekodiert weiterhin eine Data-URL, wenn keine Bytes dabei sind', () => {
    const attachment: ImageAttachment = {
      type: 'image/jpeg',
      data: `data:image/jpeg;base64,${JPEG_BYTES.toString('base64')}`,
    };

    expect(canvasAdapter.convertToBuffer(attachment).buffer.equals(JPEG_BYTES)).toBe(true);
  });

  it('dekodiert auch rohes base64 ohne Header', () => {
    const attachment: ImageAttachment = {
      type: 'image/jpeg',
      data: JPEG_BYTES.toString('base64'),
    };

    expect(canvasAdapter.convertToBuffer(attachment).buffer.equals(JPEG_BYTES)).toBe(true);
  });

  it('verarbeitet eine 7,4-MB-Data-URL ohne RangeError', () => {
    const attachment: ImageAttachment = {
      type: 'image/jpeg',
      data: `data:image/jpeg;base64,${HUGE_BYTES.toString('base64')}`,
    };

    expect(canvasAdapter.convertToBuffer(attachment).size).toBe(HUGE_BYTES.length);
  });

  it('wirft ohne Bytes und ohne data', () => {
    expect(() => canvasAdapter.convertToBuffer({ type: 'image/jpeg' })).toThrow(
      'Invalid attachment: missing data'
    );
  });

  it('wirft bei Nicht-Bild-Typ', () => {
    const attachment = { type: 'application/pdf', bytes: JPEG_BYTES } as unknown as ImageAttachment;

    expect(() => canvasAdapter.convertToBuffer(attachment)).toThrow('Invalid file type');
  });
});

describe('CanvasAdapter.validateImageAttachment', () => {
  it('akzeptiert ein Byte-Attachment', () => {
    expect(() =>
      canvasAdapter.validateImageAttachment({ type: 'image/jpeg', bytes: JPEG_BYTES })
    ).not.toThrow();
  });

  it('lehnt leere Bilddaten ab', () => {
    expect(() =>
      canvasAdapter.validateImageAttachment({ type: 'image/jpeg', bytes: Buffer.alloc(0) })
    ).toThrow('Empty image data');
  });

  it('lehnt Bilder ueber 10 MB ab — auch als Rohbytes', () => {
    // Der AI-Bildpfad umging die Grenze frueher komplett.
    expect(() =>
      canvasAdapter.validateImageAttachment({
        type: 'image/jpeg',
        bytes: Buffer.alloc(11 * 1024 * 1024),
      })
    ).toThrow('Image too large');
  });

  it('lehnt eine zu grosse Data-URL ab, ohne sie vorher zu allokieren', () => {
    const zuGross = Buffer.alloc(11 * 1024 * 1024).toString('base64');
    const gebaut: number[] = [];
    const echtesFrom = Buffer.from;
    const spion = vi
      .spyOn(Buffer, 'from')
      .mockImplementation((...args: Parameters<typeof Buffer.from>) => {
        const buf = (echtesFrom as (...a: unknown[]) => Buffer)(...args);
        gebaut.push(buf.length);
        return buf;
      });

    try {
      expect(() =>
        canvasAdapter.validateImageAttachment({
          type: 'image/jpeg',
          data: `data:image/jpeg;base64,${zuGross}`,
        })
      ).toThrow('Image too large');
      // Kein Buffer in Bildgroesse — die Groesse kam aus der base64-Laenge.
      expect(Math.max(0, ...gebaut)).toBeLessThan(1024 * 1024);
    } finally {
      spion.mockRestore();
    }
  });
});
