import { ImageComparisonSlider } from '@gruenerator/ui';

import GrueneratorImagine from '../../../assets/images/startseite/gruenerator_imagine.webp';
import ImagineOld from '../../../assets/images/startseite/imagine_old.webp';

const ImageComparisonMock = () => {
  return (
    <div className="w-full h-full flex items-center justify-center p-2 md:p-sm lg:p-md">
      <ImageComparisonSlider
        leftImage={ImagineOld}
        rightImage={GrueneratorImagine}
        altLeft="Originalbild - Vorher"
        altRight="KI-optimiert mit Grünerator Imagine"
        initialPosition={50}
        className="w-full max-w-[420px] md:max-w-[450px] lg:max-w-[500px] aspect-[4/3] rounded-lg overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
      />
    </div>
  );
};

export default ImageComparisonMock;
