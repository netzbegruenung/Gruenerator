import React, { useEffect, useRef, useState } from 'react';
import {
  ReactCompareSlider,
  ReactCompareSliderImage
} from 'react-compare-slider';
import ImagineOld from '../../../assets/images/startseite/imagine_old.jpg';
import GrueneratorImagine from '../../../assets/images/startseite/gruenerator_imagine.png';
import '../../../assets/styles/components/image-comparison.css';

const ImageComparisonMock = () => {
  const containerRef = useRef(null);
  const animationFrame = useRef(null);
  const [sliderPosition, setSliderPosition] = useState(50);

  useEffect(() => {
    const updateSliderPosition = () => {
      animationFrame.current = null;

      if (!containerRef.current) {
        return;
      }

      const rect = containerRef.current.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      // Early exit if the comparison is outside of the viewport
      if (rect.bottom <= 0 || rect.top >= viewportHeight) {
        return;
      }

      const scrollRange = viewportHeight + rect.height;
      const rawProgress = (viewportHeight - rect.top) / scrollRange;
      const clampedProgress = Math.min(Math.max(rawProgress, 0), 1);
      const targetPosition = (1 - clampedProgress) * 100;

      setSliderPosition((prev) => (
        Math.abs(prev - targetPosition) < 0.5 ? prev : targetPosition
      ));
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
    <div className="image-comparison-container" ref={containerRef}>
      <ReactCompareSlider
        itemOne={
          <ReactCompareSliderImage
            src={ImagineOld}
            alt="Originalbild - Vorher"
          />
        }
        itemTwo={
          <ReactCompareSliderImage
            src={GrueneratorImagine}
            alt="KI-optimiert mit Grünerator Imagine"
          />
        }
        position={sliderPosition}
        className="comparison-slider"
        onPositionChange={(position) => setSliderPosition(position)}
      />
    </div>
  );
};

export default ImageComparisonMock;
