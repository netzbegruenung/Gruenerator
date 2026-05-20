import { useEffect } from 'react';
import { HiXMark } from 'react-icons/hi2';

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  altText?: string;
}

export function Lightbox({ isOpen, onClose, imageSrc, altText }: LightboxProps) {
  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('keydown', handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 cursor-zoom-out animate-in fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bildvorschau"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Vorschau schließen"
        className="absolute top-4 right-4 p-2 text-white bg-transparent border-none cursor-pointer hover:opacity-80"
      >
        <HiXMark size={28} />
      </button>
      <img
        src={imageSrc}
        alt={altText || 'Vergrößertes Bild'}
        className="max-w-[95vw] max-h-[95vh] object-contain rounded-md"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}
