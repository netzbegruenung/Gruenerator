import { motion } from 'motion/react';
import React from 'react';
import { BsSquareFill } from 'react-icons/bs';
import {
  FaInstagram,
  FaFacebookF,
  FaTwitter,
  FaLinkedinIn,
  FaPinterestP,
  FaTiktok,
} from 'react-icons/fa';
import { HiArrowLeft, HiArrowRight } from 'react-icons/hi';

import Button from '../../../components/common/SubmitButton';
import useImageStudioStore from '../../../stores/imageStudioStore';
import { cn } from '../../../utils/cn';
import { slideVariants } from '../components/StepFlow';

interface ImageSizeSelectStepProps {
  onNext: () => void;
  onBack: () => void;
  direction: number;
  loading: boolean;
}

const IMAGE_SIZES = [
  {
    width: 1088,
    height: 1360,
    label: 'Instagram Post',
    aspectRatio: '4:5',
    platform: 'Instagram',
    icon: FaInstagram,
    color: '#E4405F',
  },
  {
    width: 1088,
    height: 1920,
    label: 'Instagram Story',
    aspectRatio: '9:16',
    platform: 'Instagram/TikTok',
    icon: FaInstagram,
    color: '#E4405F',
  },
  {
    width: 1200,
    height: 624,
    label: 'Facebook Post',
    aspectRatio: '1.91:1',
    platform: 'Facebook',
    icon: FaFacebookF,
    color: '#1877F2',
  },
  {
    width: 1200,
    height: 672,
    label: 'Twitter/X Post',
    aspectRatio: '16:9',
    platform: 'Twitter',
    icon: FaTwitter,
    color: '#1DA1F2',
  },
  {
    width: 1216,
    height: 640,
    label: 'LinkedIn Post',
    aspectRatio: '1.9:1',
    platform: 'LinkedIn',
    icon: FaLinkedinIn,
    color: '#0A66C2',
  },
  {
    width: 1008,
    height: 1504,
    label: 'Pinterest Pin',
    aspectRatio: '2:3',
    platform: 'Pinterest',
    icon: FaPinterestP,
    color: '#E60023',
  },
  {
    width: 1088,
    height: 1088,
    label: 'Quadrat',
    aspectRatio: '1:1',
    platform: 'Universal',
    icon: BsSquareFill,
    color: '#52907A',
  },
];

const ImageSizeSelectStep: React.FC<ImageSizeSelectStepProps> = ({
  onNext,
  onBack,
  direction,
  loading,
}) => {
  const { selectedImageSize, updateFormData } = useImageStudioStore();

  const handleSizeSelect = (size: (typeof IMAGE_SIZES)[0]) => {
    updateFormData({ selectedImageSize: size });
  };

  const handleNext = () => {
    if (selectedImageSize) {
      onNext();
    }
  };

  return (
    <motion.div
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ type: 'tween', ease: 'easeOut', duration: 0.3 }}
      className="flex flex-col w-full"
    >
      <div className="flex flex-col items-center w-full">
        {/* Title and subtitle are rendered by TemplateStudioFlow header */}
        <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-md w-full my-lg max-[768px]:grid-cols-[repeat(auto-fill,minmax(140px,1fr))] max-[768px]:gap-sm max-[480px]:grid-cols-2">
          {IMAGE_SIZES.map((size) => {
            const Icon = size.icon;
            const isSelected =
              selectedImageSize?.width === size.width && selectedImageSize?.height === size.height;
            return (
              <button
                key={`${size.width}x${size.height}`}
                className={cn(
                  'bg-[var(--card-background)] border-2 border-[var(--border-subtle)] rounded-md p-lg cursor-pointer transition-all duration-200 flex flex-col items-center gap-md min-h-[180px]',
                  'hover:border-primary-600 hover:translate-y-[-2px] hover:shadow-lg',
                  'disabled:cursor-not-allowed disabled:opacity-60',
                  'max-[768px]:p-md max-[768px]:min-h-[160px] max-[480px]:p-sm max-[480px]:min-h-[140px]',
                  isSelected && 'border-primary-600 bg-background-alt shadow-md'
                )}
                onClick={() => handleSizeSelect(size)}
                disabled={loading}
              >
                <div className="flex items-center justify-center flex-1 w-full">
                  <Icon
                    className="text-[48px] transition-transform duration-200 group-hover:scale-110 max-[768px]:text-[40px] max-[480px]:text-[36px]"
                    style={{ color: size.color }}
                  />
                </div>
                <div className="flex flex-col gap-xxs text-center w-full">
                  <div className="font-semibold text-foreground text-sm leading-snug">
                    {size.label}
                  </div>
                  <div
                    className={cn(
                      'text-xs font-medium',
                      isSelected ? 'text-foreground' : 'text-grey-400'
                    )}
                  >
                    {size.width} × {size.height}
                  </div>
                  <div
                    className={cn(
                      'text-[var(--font-size-xxs)] font-medium uppercase tracking-wider mt-xxs',
                      isSelected ? 'text-foreground' : 'text-grey-400'
                    )}
                  >
                    {size.platform}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {!selectedImageSize && (
          <p
            style={{
              textAlign: 'center',
              color: 'var(--font-color-secondary)',
              marginTop: '1rem',
              fontSize: '0.9rem',
            }}
          >
            👆 Wähle eine Bildgröße aus, um fortzufahren
          </p>
        )}

        <div className="flex justify-center gap-md mt-lg">
          <Button onClick={onBack} text="Zurück" icon={<HiArrowLeft />} disabled={loading} />
          <Button
            onClick={handleNext}
            text="Weiter"
            icon={<HiArrowRight />}
            disabled={!selectedImageSize || loading}
          />
        </div>
      </div>
    </motion.div>
  );
};

export default ImageSizeSelectStep;
