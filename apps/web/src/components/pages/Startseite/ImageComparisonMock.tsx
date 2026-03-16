import { useEffect, useRef, useState } from 'react';
import { ReactCompareSlider, ReactCompareSliderImage } from 'react-compare-slider';

import GrueneratorImagine from '../../../assets/images/startseite/gruenerator_imagine.webp';
import ImagineOld from '../../../assets/images/startseite/imagine_old.webp';

const ImageComparisonMock = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const animationFrame = useRef<number | null>(null);
  const [sliderPosition, setSliderPosition] = useState(50);

  useEffect(() => {
    const updateSliderPosition = () => {
      animationFrame.current = null;

      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        return;
      }

      const scrollRange = viewportHeight + rect.height;
      const rawProgress = (viewportHeight - rect.top) / scrollRange;
      const clampedProgress = Math.min(Math.max(rawProgress, 0), 1);
      const targetPosition = (1 - clampedProgress) * 100;

      setSliderPosition((prev) => (Math.abs(prev - targetPosition) < 0.5 ? prev : targetPosition));
    };

    const scheduleUpdate = () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
      }

      animationFrame.current = window.requestAnimationFrame(updateSliderPosition);
    };

    scheduleUpdate();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);

    return () => {
      if (animationFrame.current !== null) {
        cancelAnimationFrame(animationFrame.current);
      }

      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
    };
  }, []);

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center p-2 md:p-sm lg:p-md"
      ref={containerRef}
    >
      <ReactCompareSlider
        itemOne={<ReactCompareSliderImage src={ImagineOld} alt="Originalbild - Vorher" />}
        itemTwo={
          <ReactCompareSliderImage
            src={GrueneratorImagine}
            alt="KI-optimiert mit Grünerator Imagine"
          />
        }
        position={sliderPosition}
        className="w-full max-w-[500px] sm:max-w-[420px] md:max-w-[450px] lg:max-w-[500px] h-auto rounded-lg overflow-hidden shadow-[0_8px_24px_rgba(0,0,0,0.12)] [--handle-color:var(--interactive-accent-color)]"
        onPositionChange={setSliderPosition}
      />
    </div>
  );
};

export default ImageComparisonMock;
