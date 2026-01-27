import { useEffect } from 'react';

import useImageStudioStore from '../../stores/imageStudioStore';

import ImageStudioPage from './ImageStudioPage';

/**
 * Wrapper component for the /imagine route.
 * Pre-selects the 'ki' category before rendering ImageStudioPage.
 */
const ImaginePage: React.FC = () => {
  const { category, setCategory } = useImageStudioStore();

  useEffect(() => {
    if (!category) {
      setCategory('ki');
    }
  }, [category, setCategory]);

  return <ImageStudioPage />;
};

export default ImaginePage;
