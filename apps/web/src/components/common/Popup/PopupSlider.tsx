import { motion, AnimatePresence } from 'motion/react';
import React, { useState, useEffect, useCallback, useRef } from 'react';

import Icon from '../Icon';
import './base-popup.css';

interface Slide {
  [key: string]: unknown;
}

interface RenderSlideProps {
  slide: Slide;
  index: number;
  isMobile: boolean;
  onNext: () => void;
  onPrev: () => void;
  [key: string]: unknown;
}

interface RenderFooterProps {
  currentSlide: number;
  totalSlides: number;
  isLastSlide: boolean;
  onClose: () => void;
  onNext: () => void;
  [key: string]: unknown;
}

interface PopupSliderProps {
  slides: Slide[];
  onClose: () => void;
  renderSlide: (props: RenderSlideProps) => React.ReactNode;
  renderFooter?: (props: RenderFooterProps) => React.ReactNode;
  autoPlay?: boolean;
  autoPlayInterval?: number;
}

const PopupSlider = ({
  slides,
  onClose,
  renderSlide,
  renderFooter,
  autoPlay = false,
  autoPlayInterval = 4000,
}: PopupSliderProps) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(autoPlay);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalSlides = slides.length;

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (isAutoPlaying) {
      intervalRef.current = setInterval(() => {
        setCurrentSlide((prev) => (prev + 1) % totalSlides);
      }, autoPlayInterval);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAutoPlaying, totalSlides, autoPlayInterval]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      switch (event.key) {
        case 'ArrowLeft':
          event.preventDefault();
          handlePrevSlide();
          break;
        case 'ArrowRight':
          event.preventDefault();
          handleNextSlide();
          break;
        default:
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [totalSlides]);

  const handleTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const handleTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > 50;
    const isRightSwipe = distance < -50;

    if (isLeftSwipe) {
      handleNextSlide();
    }
    if (isRightSwipe) {
      handlePrevSlide();
    }
  };

  const handlePrevSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev - 1 + totalSlides) % totalSlides);
    setIsAutoPlaying(false);
  }, [totalSlides]);

  const handleNextSlide = useCallback(() => {
    setCurrentSlide((prev) => (prev + 1) % totalSlides);
    setIsAutoPlaying(false);
  }, [totalSlides]);

  const handleDotClick = (index: number) => {
    setCurrentSlide(index);
    setIsAutoPlaying(false);
  };

  const currentSlideData = slides[currentSlide];

  return (
    <div className="popup-slider">
      <div
        className="popup-slider-container"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentSlide}
            className="popup-slider-slide"
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.4, ease: 'easeInOut' }}
          >
            {renderSlide({
              slide: currentSlideData,
              index: currentSlide,
              isMobile,
              onNext: handleNextSlide,
              onPrev: handlePrevSlide,
            })}
          </motion.div>
        </AnimatePresence>

        {!isMobile && (
          <>
            <button
              className="popup-slider-nav popup-slider-nav--prev"
              onClick={handlePrevSlide}
              aria-label="Vorherige Folie"
            >
              <Icon category="ui" name="arrowLeft" />
            </button>

            <button
              className="popup-slider-nav popup-slider-nav--next"
              onClick={handleNextSlide}
              aria-label="Nächste Folie"
            >
              <Icon category="ui" name="arrowRight" />
            </button>
          </>
        )}
      </div>

      <div className="popup-slider-dots">
        {slides.map((_, index: number) => (
          <button
            key={index}
            className={`popup-slider-dot ${index === currentSlide ? 'popup-slider-dot--active' : ''}`}
            onClick={() => handleDotClick(index)}
            aria-label={`Zu Folie ${index + 1} wechseln`}
          />
        ))}
      </div>

      {renderFooter && (
        <div className="popup-slider-footer">
          {renderFooter({
            currentSlide,
            totalSlides,
            isLastSlide: currentSlide === totalSlides - 1,
            onClose,
            onNext: handleNextSlide,
          })}
        </div>
      )}
    </div>
  );
};

export default PopupSlider;
