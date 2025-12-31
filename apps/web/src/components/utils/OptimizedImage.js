import React from 'react';
import PropTypes from 'prop-types';
import { LazyLoadImage } from 'react-lazy-load-image-component';
import 'react-lazy-load-image-component/src/effects/blur.css';

const OptimizedImage = ({
  src,
  alt,
  className,
  width,
  height,
  effect = 'blur',
  placeholderSrc = '/assets/images/placeholder-image.svg',
  onError,
  onLoad,
  ...props
}) => {
  return (
    <LazyLoadImage
      src={src}
      alt={alt}
      className={className}
      effect={effect}
      width={width}
      height={height}
      placeholderSrc={placeholderSrc}
      onError={onError}
      onLoad={onLoad}
      {...props}
    />
  );
};

OptimizedImage.propTypes = {
  src: PropTypes.string.isRequired,
  alt: PropTypes.string.isRequired,
  className: PropTypes.string,
  width: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  height: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  effect: PropTypes.oneOf(['blur', 'black-and-white', 'opacity']),
  placeholderSrc: PropTypes.string,
  onError: PropTypes.func,
  onLoad: PropTypes.func
};

export default OptimizedImage; 