import {
  gradientLine,
  PROFILBILD_SIZE,
  placementRect,
  presetDesigns,
  type FlatBackground,
  type ProfilbildAssetSrc,
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

import { stripeRects, type ProfilbildModel } from './sceneModel';

interface SceneProps {
  model: ProfilbildModel;
  person: SkImage;
  images: Record<ProfilbildAssetSrc, SkImage>;
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

function BackgroundLayer({
  model,
  images,
  isAustria,
}: Pick<SceneProps, 'model' | 'images' | 'isAustria'>) {
  const bg = model.background;
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

export function ProfilbildScene({ model, person, images, isAustria }: SceneProps) {
  const rect = placementRect({ width: person.width(), height: person.height() }, model.person);
  return (
    <Group>
      <BackgroundLayer model={model} images={images} isAustria={isAustria} />
      <Image image={person} {...rect} fit="fill" />
      {model.stickers.map((s) => (
        <Group
          key={s.uid}
          transform={[
            { translateX: s.x },
            { translateY: s.y },
            { rotate: (s.rotation * Math.PI) / 180 },
          ]}
        >
          <Image
            image={images[s.src]}
            x={-s.width / 2}
            y={-s.height / 2}
            width={s.width}
            height={s.height}
            fit="fill"
          />
        </Group>
      ))}
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
