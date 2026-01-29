import { useEffect } from 'react';
import { useParams } from 'react-router-dom';

import useImageStudioStore from '../../stores/imageStudioStore';

import ImageStudioPage from './ImageStudioPage';
import { URL_TYPE_MAP } from './utils/typeConfig';

import type { UrlTypeMapKey } from './types/componentTypes';

/**
 * Wrapper component for the /imagine and /imagine/:type routes.
 * Pre-selects the 'ki' category and optionally sets the type from the URL.
 */
const ImaginePage: React.FC = () => {
  const { type: urlType } = useParams();
  const { category, setCategory, setType } = useImageStudioStore();

  useEffect(() => {
    if (!category) {
      setCategory('ki');
    }
  }, [category, setCategory]);

  useEffect(() => {
    if (urlType) {
      const mappedType = urlType in URL_TYPE_MAP ? URL_TYPE_MAP[urlType as UrlTypeMapKey] : urlType;
      if (mappedType) {
        setCategory('ki');
        setType(mappedType);
      }
    }
  }, [urlType, setCategory, setType]);

  return <ImageStudioPage />;
};

export default ImaginePage;
