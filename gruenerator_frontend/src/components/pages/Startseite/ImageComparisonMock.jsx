import React from 'react';
import {
  ReactCompareSlider,
  ReactCompareSliderImage
} from 'react-compare-slider';
import ImagineOld from '../../../assets/images/startseite/imagine_old.jpg';
import GrueneratorImagine from '../../../assets/images/startseite/gruenerator_imagine.png';
import '../../../assets/styles/components/image-comparison.css';

const ImageComparisonMock = () => {
  return (
    <div className="image-comparison-container">
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
        position={50}
        className="comparison-slider"
      />
    </div>
  );
};

export default ImageComparisonMock;