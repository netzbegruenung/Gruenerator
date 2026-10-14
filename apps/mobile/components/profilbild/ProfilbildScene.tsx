import {
  gradientLine,
  PROFILBILD_SIZE,
  placementRect,
  presetDesigns,
  type FlatBackground,
  type PersonPlacement,
} from '@gruenerator/shared/profilbild';
import {
  drawAsImage,
  Group,
  Image,
  ImageFormat,
  LinearGradient,
  Rect,
  vec,
  type SkImage,
} from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';

import { type LiveElement } from './profilbildGestures';
import {
  stripeRects,
  type ProfilbildModel,
  type SceneImages,
  type SceneSticker,
} from './sceneModel';

interface SceneProps {
  model: ProfilbildModel;
  person: SkImage;
  images: SceneImages;
  isAustria: boolean;
}

const S = PROFILBILD_SIZE;

function FlatLayer({ background }: { background: FlatBackground }) {
  switch (background.kind) {
    case 'color':
      return <Rect x={0} y={0} width={S} height={S} color={background.color} />;
    case 'gradient': {
      const [x0, y0, x1, y1] = gradientLine(background.angle, S);
      return (
        <Rect x={0} y={0} width={S} height={S}>
          <LinearGradient start={vec(x0, y0)} end={vec(x1, y1)} colors={background.stops} />
        </Rect>
      );
    }
    case 'stripes':
      return (
        <>
          {stripeRects(background.colors).map((r) => (
            <Rect key={r.y} x={0} y={r.y} width={S} height={r.height} color={r.color} />
          ))}
        </>
      );
  }
}

/** The background alone — also the round preview before a photo is in. */
export function BackgroundLayer({
  background: bg,
  images,
  isAustria,
}: {
  background: ProfilbildModel['background'];
  /** Bundled assets for preset overlays; a missing one is left out. */
  images: Partial<Record<string, SkImage>>;
  isAustria: boolean;
}) {
  if (bg.kind === 'image') {
    return <Image image={bg.image} x={0} y={0} width={S} height={S} fit="cover" />;
  }
  if (bg.kind === 'preset') {
    const design = presetDesigns(isAustria).find((d) => d.id === bg.designId);
    if (!design) return null;
    return (
      <>
        <FlatLayer background={design.base} />
        {design.overlays.map((o) => {
          const image = images[o.src];
          if (!image) return null;
          const width = o.width * S;
          const height = (width * image.height()) / image.width();
          return (
            <Image
              key={o.src}
              image={image}
              x={o.x * S - width / 2}
              y={o.y * S - height / 2}
              width={width}
              height={height}
              fit="fill"
              opacity={o.opacity}
            />
          );
        })}
      </>
    );
  }
  return <FlatLayer background={bg} />;
}

export function ProfilbildScene({
  model,
  person,
  images,
  isAustria,
  live,
}: SceneProps & {
  /** The element a gesture is moving; drawn from this instead of the model while set. */
  live?: SharedValue<LiveElement | null>;
}) {
  const rect = placementRect({ width: person.width(), height: person.height() }, model.person);
  return (
    <Group>
      <BackgroundLayer background={model.background} images={images} isAustria={isAustria} />
      {live ? (
        <LivePerson person={person} placement={model.person} live={live} />
      ) : (
        <Image image={person} {...rect} fit="fill" />
      )}
      {model.stickers.map((s) => {
        const image = images[s.src];
        if (!image) return null;
        if (live) return <LiveSticker key={s.uid} sticker={s} image={image} live={live} />;
        return (
          <Group
            key={s.uid}
            transform={[
              { translateX: s.x },
              { translateY: s.y },
              { rotate: (s.rotation * Math.PI) / 180 },
            ]}
          >
            <Image
              image={image}
              x={-s.width / 2}
              y={-s.height / 2}
              width={s.width}
              height={s.height}
              fit="fill"
            />
          </Group>
        );
      })}
    </Group>
  );
}

function LivePerson({
  person,
  placement,
  live,
}: {
  person: SkImage;
  placement: PersonPlacement;
  live: SharedValue<LiveElement | null>;
}) {
  const src = { width: person.width(), height: person.height() };
  const rect = useDerivedValue(() => {
    const l = live.value;
    return placementRect(src, l?.kind === 'person' ? l.placement : placement);
  });
  return <Image image={person} rect={rect} fit="fill" />;
}

/** A sticker's transform and centred rect, following the live element while a gesture moves it. */
export function useLiveStickerBox(sticker: SceneSticker, live: SharedValue<LiveElement | null>) {
  const box = useDerivedValue(() => {
    const l = live.value;
    return l?.kind === 'sticker' && l.sticker.uid === sticker.uid ? l.sticker : sticker;
  });
  const transform = useDerivedValue(() => [
    { translateX: box.value.x },
    { translateY: box.value.y },
    { rotate: (box.value.rotation * Math.PI) / 180 },
  ]);
  const rect = useDerivedValue(() => ({
    x: -box.value.width / 2,
    y: -box.value.height / 2,
    width: box.value.width,
    height: box.value.height,
  }));
  return { transform, rect };
}

function LiveSticker({
  sticker,
  image,
  live,
}: {
  sticker: SceneSticker;
  image: SkImage;
  live: SharedValue<LiveElement | null>;
}) {
  const { transform, rect } = useLiveStickerBox(sticker, live);
  return (
    <Group transform={transform}>
      <Image image={image} rect={rect} fit="fill" />
    </Group>
  );
}

export async function exportProfilbildBase64(props: SceneProps): Promise<string> {
  const img = await drawAsImage(<ProfilbildScene {...props} />, {
    width: PROFILBILD_SIZE,
    height: PROFILBILD_SIZE,
  });
  if (!img) throw new Error('Export fehlgeschlagen');
  return img.encodeToBase64(ImageFormat.PNG, 100);
}
