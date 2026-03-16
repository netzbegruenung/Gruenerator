import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@gruenerator/ui';
import { type JSX } from 'react';
import { SiCanva } from 'react-icons/si';

import CopyButton from './CopyButton';

/**
 * CanvaTemplateModal - Rich modal for opening Canva templates
 * Shows preview thumbnail, description, and opens template in new tab
 */
interface CanvaTemplateModalProps {
  isOpen?: boolean;
  url: string;
  previewImage?: string;
  title?: string;
  sharepicLines?: {
    line1?: string;
    line2?: string;
    line3?: string;
    line4?: string;
    line5?: string;
  };
  onClose: () => void;
}

const CanvaTemplateModal = ({
  isOpen = true,
  url,
  previewImage,
  title = 'In Canva bearbeiten',
  sharepicLines,
  onClose,
}: CanvaTemplateModalProps): JSX.Element => {
  const formatLinesForCopy = (lines: CanvaTemplateModalProps['sharepicLines']) => {
    if (!lines) return '';
    return [1, 2, 3, 4, 5]
      .map((n) => (lines as Record<string, string | undefined>)[`line${n}`])
      .filter(Boolean)
      .join('\n');
  };

  const hasLines =
    sharepicLines &&
    [1, 2, 3, 4, 5].some((n) => (sharepicLines as Record<string, string | undefined>)[`line${n}`]);

  const handleOpenCanva = () => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[700px] p-0 overflow-y-auto max-h-[85vh] max-[560px]:max-h-[90vh]">
        <div className="flex flex-row gap-lg p-lg max-[560px]:flex-col max-[560px]:p-md max-[560px]:pt-xl">
          {previewImage && (
            <div className="shrink-0 flex items-center justify-center bg-background-alt rounded-sm p-sm max-[560px]:p-md">
              <img
                src={previewImage}
                alt="Vorlagenvorschau"
                className="w-[180px] h-auto rounded-sm object-contain max-[560px]:w-full max-[560px]:max-w-[200px]"
              />
            </div>
          )}

          <div className="flex flex-col justify-center gap-md flex-1 max-[560px]:text-center max-[560px]:items-center">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-sm">
                <SiCanva className="w-6 h-6 text-primary-600" />
                {title}
              </DialogTitle>
            </DialogHeader>

            <div className="text-foreground text-[0.9rem] leading-relaxed [&_p]:m-0">
              <p>
                Bearbeite diese Vorlage direkt in Canva. Du kannst Texte, Farben und Elemente nach
                deinen Wünschen anpassen.
              </p>
            </div>

            <div className="flex max-[560px]:justify-center max-[560px]:w-full">
              <button
                className="flex items-center justify-center gap-sm bg-gradient-to-br from-[#7d2ae8] to-[#00c4cc] text-white border-none px-lg py-sm rounded-sm text-[0.95rem] font-semibold cursor-pointer transition-all duration-200 hover:scale-[1.01] hover:shadow-lg max-[560px]:w-full"
                onClick={handleOpenCanva}
              >
                <SiCanva className="w-[18px] h-[18px]" />
                In Canva öffnen
              </button>
            </div>

            {hasLines && (
              <div className="mt-md p-md bg-background-alt rounded-sm w-full">
                <div className="flex justify-between items-center mb-sm font-semibold text-[0.85rem] text-foreground-heading">
                  <span>Gedicht-Text:</span>
                  <CopyButton
                    directContent={formatLinesForCopy(sharepicLines)}
                    variant="icon"
                    className="p-xs"
                  />
                </div>
                <div className="whitespace-pre-line font-sans text-[0.9rem] leading-relaxed text-foreground">
                  {formatLinesForCopy(sharepicLines)}
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CanvaTemplateModal;
