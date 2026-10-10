import { AlphaType, ColorType, Skia, type SkImage } from '@shopify/react-native-skia';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { useCallback, useEffect, useRef, useState } from 'react';

import { CutoutError, cutoutFromRef } from '../../services/backgroundRemoval';

import { trimBounds } from './trimBounds';

import type { BevImageRef } from '../../services/imageEditMobile';

export type CutoutState =
  | { status: 'idle' }
  | { status: 'working'; source: BevImageRef }
  | { status: 'ready'; source: BevImageRef; person: SkImage }
  | { status: 'error'; source: BevImageRef; message: string };

const NO_PERSON_MESSAGE = 'Auf dem Foto wurde keine Person erkannt.';
const GENERIC_ERROR_MESSAGE = 'Freistellen fehlgeschlagen. Bitte erneut versuchen.';

class NoPersonError extends Error {
  constructor() {
    super(NO_PERSON_MESSAGE);
  }
}

async function decode(uri: string): Promise<SkImage> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('decode failed');
  return image;
}

async function cutAndTrim(ref: BevImageRef): Promise<SkImage> {
  const uri = await cutoutFromRef(ref);
  const full = await decode(uri);
  const width = full.width();
  const height = full.height();
  const pixels = full.readPixels(0, 0, {
    width,
    height,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  const bounds = pixels ? trimBounds(pixels, width, height) : null;
  if (!bounds) throw new NoPersonError();

  const cropped = await manipulateAsync(
    uri,
    [
      {
        crop: { originX: bounds.x, originY: bounds.y, width: bounds.width, height: bounds.height },
      },
    ],
    { format: SaveFormat.PNG }
  );
  return decode(cropped.uri);
}

export function useProfilbildCutout() {
  const [state, setState] = useState<CutoutState>({ status: 'idle' });
  const runId = useRef(0);

  const start = useCallback((ref: BevImageRef) => {
    const id = ++runId.current;
    setState({ status: 'working', source: ref });
    cutAndTrim(ref)
      .then((person) => {
        if (id === runId.current) setState({ status: 'ready', source: ref, person });
      })
      .catch((error: unknown) => {
        if (id !== runId.current) return;
        const message =
          error instanceof CutoutError || error instanceof NoPersonError
            ? error.message
            : GENERIC_ERROR_MESSAGE;
        setState({ status: 'error', source: ref, message });
      });
  }, []);

  const retry = useCallback(() => {
    setState((current) => {
      if (current.status === 'error') queueMicrotask(() => start(current.source));
      return current;
    });
  }, [start]);

  const reset = useCallback(() => {
    runId.current++;
    setState({ status: 'idle' });
  }, []);

  useEffect(
    () => () => {
      runId.current++;
    },
    []
  );

  return { state, start, retry, reset };
}
