import { FaUnsplash } from 'react-icons/fa';

interface UnsplashButtonProps {
    searchTerms?: string[];
}

const UnsplashButton = ({ searchTerms }: UnsplashButtonProps) => {
  const handleUnsplashClick = () => {
    if (!searchTerms || searchTerms.length === 0) return;

    // Nimm den ersten Suchbegriff und bereite ihn für die URL vor
    const searchQuery = encodeURIComponent(searchTerms[0]);
    const unsplashUrl = `https://unsplash.com/de/s/fotos/${searchQuery}?license=free`;

    // Öffne in neuem Tab
    window.open(unsplashUrl, '_blank');
  };

  return (
    <button
      type="button"
      onClick={handleUnsplashClick}
      disabled={!searchTerms || searchTerms.length === 0}
      className="unsplash-search-button"
      aria-label="unsplash"
    >
      <FaUnsplash />
      unsplash
    </button>
  );
};

export default UnsplashButton;
