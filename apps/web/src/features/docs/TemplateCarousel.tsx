import { templates, type TemplateType } from '@gruenerator/docs';
import { cn } from '@gruenerator/ui';
import { memo, useEffect, useRef, useState } from 'react';
import { FiChevronDown, FiMoreVertical } from 'react-icons/fi';
import { PiKanban, PiPencilLine } from 'react-icons/pi';

import { boardTemplates } from '../boards/boardTemplates';

const STORAGE_KEY = 'gruenerator_web_templates_hidden';

interface TemplateCarouselProps {
  onTemplateSelect: (templateType: TemplateType) => void;
  onShowGallery: () => void;
  onCreateBoardFromTemplate: (templateId: string) => void;
  onCreateWhiteboard: () => void;
}

export const TemplateCarousel = memo(
  ({
    onTemplateSelect,
    onShowGallery,
    onCreateBoardFromTemplate,
    onCreateWhiteboard,
  }: TemplateCarouselProps) => {
    const [isHidden, setIsHidden] = useState(() => {
      try {
        return localStorage.getItem(STORAGE_KEY) === 'true';
      } catch {
        return false;
      }
    });
    const [showMenu, setShowMenu] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
      if (!showMenu) return;

      const handleClickOutside = (e: MouseEvent) => {
        if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
          setShowMenu(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showMenu]);

    const toggleHidden = () => {
      const next = !isHidden;
      setIsHidden(next);
      setShowMenu(false);
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        // localStorage unavailable
      }
    };

    return (
      <div className="max-sm:hidden bg-grey-50 dark:bg-grey-800 rounded-lg px-md pt-sm pb-md mb-lg">
        <div className="flex justify-between items-center h-[52px]">
          <h2 className="text-base font-normal text-foreground m-0">Neu erstellen</h2>

          <div className="flex items-center gap-sm">
            <button
              className="flex items-center gap-1 bg-transparent border-none text-sm font-medium text-grey-500 cursor-pointer px-xs py-xxs rounded-lg hover:bg-hover-alt hover:text-foreground font-[inherit]"
              onClick={onShowGallery}
            >
              Vorlagengalerie <FiChevronDown size={14} />
            </button>

            <div className="w-px h-6 bg-grey-300/50 dark:bg-grey-600 shrink-0" />

            <div className="relative" ref={menuRef}>
              <button
                className="flex items-center justify-center w-8 h-8 bg-transparent border-none rounded-lg cursor-pointer text-grey-500 text-lg hover:bg-hover-alt hover:text-foreground"
                onClick={() => setShowMenu((prev) => !prev)}
                aria-label="Weitere Optionen"
              >
                <FiMoreVertical size={18} />
              </button>

              {showMenu && (
                <div className="absolute top-full right-0 mt-1 bg-background-pure dark:bg-grey-700 border border-grey-200 dark:border-grey-600 rounded-lg shadow-md z-10 min-w-[220px] overflow-hidden">
                  <button
                    className="block w-full py-2.5 px-4 bg-transparent border-none text-left text-sm text-foreground cursor-pointer font-[inherit] hover:bg-grey-100 dark:hover:bg-grey-600"
                    onClick={toggleHidden}
                  >
                    {isHidden ? 'Vorlagen anzeigen' : 'Vorlagen ausblenden'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {!isHidden && (
          <div className="flex gap-4 overflow-x-auto py-2 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {templates.map((template) => (
              <button
                key={template.id}
                className="group/item shrink-0 w-[118px] cursor-pointer bg-transparent border-none p-0 text-left font-[inherit]"
                onClick={() => onTemplateSelect(template.id)}
                title={template.description}
              >
                <div
                  className={cn(
                    'w-[118px] h-[150px] border border-grey-200 dark:border-grey-600 rounded bg-background-pure dark:bg-grey-700 overflow-hidden relative transition-[box-shadow,border-color] duration-150 ease-out group-hover/item:shadow-sm group-hover/item:border-grey-300 dark:group-hover/item:border-grey-500',
                    template.id === 'blank' && 'flex items-center justify-center'
                  )}
                >
                  {template.id === 'blank' ? (
                    <span className="text-[2.5rem] font-light leading-none text-secondary-600">
                      +
                    </span>
                  ) : (
                    <>
                      <div
                        className="w-[590px] p-[32px_40px] scale-[0.2] origin-top-left pointer-events-none select-none text-foreground font-[PT_Sans,Arial,sans-serif] leading-normal [&_h1]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h1]:text-2xl [&_h1]:font-bold [&_h1]:mb-3 [&_h1]:mt-0 [&_h1]:leading-tight [&_h2]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h2]:text-[1.1rem] [&_h2]:font-semibold [&_h2]:mt-3.5 [&_h2]:mb-1.5 [&_h2]:leading-snug [&_h3]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h3]:text-[0.95rem] [&_h3]:font-semibold [&_h3]:mt-2.5 [&_h3]:mb-1 [&_p]:text-[0.8rem] [&_p]:mb-2 [&_p]:mt-0 [&_p]:leading-normal [&_ul]:text-[0.8rem] [&_ul]:mb-2 [&_ul]:mt-0 [&_ul]:pl-5 [&_ol]:text-[0.8rem] [&_ol]:mb-2 [&_ol]:mt-0 [&_ol]:pl-5 [&_li]:mb-0.5 [&_blockquote]:border-l-[3px] [&_blockquote]:border-grey-300 dark:[&_blockquote]:border-grey-500 [&_blockquote]:my-2 [&_blockquote]:mx-0 [&_blockquote]:py-1 [&_blockquote]:px-3 [&_blockquote]:text-grey-500 [&_hr]:border-none [&_hr]:border-t [&_hr]:border-grey-200 dark:[&_hr]:border-grey-600 [&_hr]:my-2.5 [&_strong]:font-semibold [&_em]:italic [&_table]:w-full [&_table]:border-collapse [&_table]:text-[0.7rem] [&_th]:border [&_th]:border-grey-200 dark:[&_th]:border-grey-600 [&_th]:bg-grey-100 dark:[&_th]:bg-grey-600 [&_th]:px-1.5 [&_th]:py-1 [&_th]:text-left [&_th]:font-semibold [&_td]:border [&_td]:border-grey-200 dark:[&_td]:border-grey-600 [&_td]:px-1.5 [&_td]:py-1"
                        dangerouslySetInnerHTML={{ __html: template.content }}
                      />
                      <div className="absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-b from-transparent to-white dark:to-grey-700 pointer-events-none" />
                    </>
                  )}
                </div>
                <div className="pt-1.5 px-1">
                  <span className="block text-[0.8125rem] font-medium text-foreground truncate">
                    {template.name}
                  </span>
                  <span className="block text-xs font-light text-grey-500 truncate">
                    {template.description}
                  </span>
                </div>
              </button>
            ))}

            <div className="w-px self-stretch bg-grey-200 dark:bg-grey-600 shrink-0 my-1" />

            {boardTemplates.map((bt) => (
              <button
                key={bt.id}
                className="group/item shrink-0 w-[118px] cursor-pointer bg-transparent border-none p-0 text-left font-[inherit]"
                onClick={() => onCreateBoardFromTemplate(bt.id)}
                title={bt.description}
              >
                <div className="w-[118px] h-[150px] border border-grey-200 dark:border-grey-600 rounded bg-secondary-50 dark:bg-secondary-900/20 overflow-hidden flex items-center justify-center transition-[box-shadow,border-color] duration-150 ease-out group-hover/item:shadow-sm group-hover/item:border-secondary-300 dark:group-hover/item:border-secondary-500">
                  <PiKanban size={36} className="text-secondary-600 dark:text-secondary-400" />
                </div>
                <div className="pt-1.5 px-1">
                  <span className="block text-[0.8125rem] font-medium text-foreground truncate">
                    {bt.name}
                  </span>
                  <span className="block text-xs font-light text-grey-500 truncate">
                    {bt.description}
                  </span>
                </div>
              </button>
            ))}

            <button
              className="group/item shrink-0 w-[118px] cursor-pointer bg-transparent border-none p-0 text-left font-[inherit]"
              onClick={onCreateWhiteboard}
              title="Neues Whiteboard erstellen"
            >
              <div className="w-[118px] h-[150px] border border-grey-200 dark:border-grey-600 rounded bg-secondary-50 dark:bg-secondary-900/20 overflow-hidden flex items-center justify-center transition-[box-shadow,border-color] duration-150 ease-out group-hover/item:shadow-sm group-hover/item:border-secondary-300 dark:group-hover/item:border-secondary-500">
                <PiPencilLine size={36} className="text-secondary-600 dark:text-secondary-400" />
              </div>
              <div className="pt-1.5 px-1">
                <span className="block text-[0.8125rem] font-medium text-foreground truncate">
                  Whiteboard
                </span>
                <span className="block text-xs font-light text-grey-500 truncate">
                  Freie Zeichenfläche
                </span>
              </div>
            </button>
          </div>
        )}
      </div>
    );
  }
);

TemplateCarousel.displayName = 'TemplateCarousel';
