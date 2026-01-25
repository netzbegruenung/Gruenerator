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
import { slideVariants } from '../components/StepFlow';
import './ImageSizeSelectStep.css';

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

  console.log('[ImageSizeSelectStep] Rendering with selectedImageSize:', selectedImageSize);

  const handleSizeSelect = (size: (typeof IMAGE_SIZES)[0]) => {
    console.log('[ImageSizeSelectStep] Size selected:', size);
    updateFormData({ selectedImageSize: size });
  };

  const handleNext = () => {
    console.log('[ImageSizeSelectStep] Next clicked, selectedImageSize:', selectedImageSize);
    if (selectedImageSize) {
      console.log('[ImageSizeSelectStep] Proceeding to next step');
      onNext();
    } else {
      console.log('[ImageSizeSelectStep] No size selected, cannot proceed');
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
      className="typeform-step"
    >
      <div className="typeform-step__content image-size-select-content">
        {/* Title and subtitle are rendered by TemplateStudioFlow header */}
        <div className="image-size-grid">
          {IMAGE_SIZES.map((size) => {
            const Icon = size.icon;
            return (
              <button
                key={`${size.width}x${size.height}`}
                className={`image-size-card ${
                  selectedImageSize?.width === size.width &&
                  selectedImageSize?.height === size.height
                    ? 'image-size-card--selected'
                    : ''
                }`}
                onClick={() => handleSizeSelect(size)}
                disabled={loading}
              >
                <div className="image-size-card__icon-container">
                  <Icon className="image-size-card__icon" style={{ color: size.color }} />
                </div>
                <div className="image-size-card__info">
                  <div className="image-size-card__label">{size.label}</div>
                  <div className="image-size-card__dimensions">
                    {size.width} × {size.height}
                  </div>
                  <div className="image-size-card__platform">{size.platform}</div>
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

        <div className="typeform-step__actions">
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
