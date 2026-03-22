import * as React from 'react';
import { cn } from '../../lib/cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageComparisonSliderProps extends React.HTMLAttributes<HTMLDivElement> {
  leftImage: string;
  rightImage: string;
  altLeft?: string;
  altRight?: string;
  initialPosition?: number;
}

export const ImageComparisonSlider = React.forwardRef<HTMLDivElement, ImageComparisonSliderProps>(
  (
    {
      className,
      leftImage,
      rightImage,
      altLeft = 'Left image',
      altRight = 'Right image',
      initialPosition = 50,
      ...props
    },
    ref
  ) => {
    const [sliderPosition, setSliderPosition] = React.useState(initialPosition);
    const [isDragging, setIsDragging] = React.useState(false);
    const containerRef = React.useRef<HTMLDivElement>(null);

    const handleMove = (clientX: number) => {
      if (!containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      let newPosition = (x / rect.width) * 100;

      newPosition = Math.max(0, Math.min(100, newPosition));

      setSliderPosition(newPosition);
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      handleMove(e.clientX);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging) return;
      handleMove(e.touches[0].clientX);
    };

    const handleInteractionStart = (e: React.MouseEvent | React.TouchEvent) => {
      setIsDragging(true);
    };
    const handleInteractionEnd = () => {
      setIsDragging(false);
    };

    React.useEffect(() => {
      if (isDragging) {
        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('touchmove', handleTouchMove);
        document.addEventListener('mouseup', handleInteractionEnd);
        document.addEventListener('touchend', handleInteractionEnd);
        document.body.style.cursor = 'ew-resize';
      } else {
        document.body.style.cursor = '';
      }

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('touchmove', handleTouchMove);
        document.removeEventListener('mouseup', handleInteractionEnd);
        document.removeEventListener('touchend', handleInteractionEnd);
        document.body.style.cursor = '';
      };
    }, [isDragging]);

    return (
      <div
        ref={containerRef}
        className={cn('relative w-full h-full overflow-hidden select-none group', className)}
        onMouseDown={handleInteractionStart}
        onTouchStart={handleInteractionStart}
        {...props}
      >
        {/* Right Image (bottom layer) */}
        <img
          src={rightImage}
          alt={altRight}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          draggable={false}
        />

        {/* Left Image (top layer, clipped) */}
        <div
          className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
          style={{
            clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
          }}
        >
          <img
            src={leftImage}
            alt={altLeft}
            className="w-full h-full object-cover"
            draggable={false}
          />
        </div>

        {/* Slider Handle and Divider */}
        <div
          className="absolute top-0 h-full w-1 cursor-ew-resize"
          style={{ left: `calc(${sliderPosition}% - 2px)` }}
        >
          {/* Divider Line */}
          <div className="absolute inset-y-0 w-1 bg-background/50 backdrop-blur-sm"></div>

          {/* Handle */}
          <div
            className={cn(
              'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-12 w-12 flex items-center justify-center rounded-full bg-background/50 text-foreground shadow-xl backdrop-blur-md',
              'transition-all duration-300 ease-in-out',
              'group-hover:scale-105',
              isDragging && 'scale-105 shadow-2xl shadow-primary/50'
            )}
            role="slider"
            aria-valuenow={sliderPosition}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-orientation="horizontal"
            aria-label="Image comparison slider"
          >
            <div className="flex items-center text-primary">
              <ChevronLeft className="h-5 w-5 drop-shadow-md" />
              <ChevronRight className="h-5 w-5 drop-shadow-md" />
            </div>
          </div>
        </div>
      </div>
    );
  }
);

ImageComparisonSlider.displayName = 'ImageComparisonSlider';
