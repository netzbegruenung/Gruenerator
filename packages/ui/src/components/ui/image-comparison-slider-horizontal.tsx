import { useCallback, useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface ImageComparisonSliderProps extends React.HTMLAttributes<HTMLDivElement> {
  leftImage: string;
  rightImage: string;
  altLeft?: string;
  altRight?: string;
  initialPosition?: number;
}

export function ImageComparisonSlider({
  className,
  leftImage,
  rightImage,
  altLeft = 'Left image',
  altRight = 'Right image',
  initialPosition = 50,
  ...props
}: ImageComparisonSliderProps) {
  const [sliderPosition, setSliderPosition] = useState(initialPosition);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const newPosition = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    setSliderPosition(newPosition);
  }, []);

  useEffect(() => {
    if (!isDragging) return;

    const onMouseMove = (e: MouseEvent) => handleMove(e.clientX);
    const onTouchMove = (e: TouchEvent) => handleMove(e.touches[0].clientX);
    const onEnd = () => setIsDragging(false);

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('touchmove', onTouchMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchend', onEnd);
    document.body.style.cursor = 'ew-resize';

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchend', onEnd);
      document.body.style.cursor = '';
    };
  }, [isDragging, handleMove]);

  return (
    <div
      ref={containerRef}
      className={cn('relative w-full h-full overflow-hidden select-none group', className)}
      onMouseDown={() => setIsDragging(true)}
      onTouchStart={() => setIsDragging(true)}
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
