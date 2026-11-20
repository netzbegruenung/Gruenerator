import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@gruenerator/ui';
import { createElement, useState } from 'react';

import {
  LINK_ICONS,
  detectIconFromUrl,
  detectTitleFromUrl,
  getLinkIcon,
} from '../config/linkIcons';
import { type GroupLink } from '../hooks/useGroups';

import { cn } from '@/utils/cn';

interface AddLinkDialogProps {
  onClose: () => void;
  onAddLink: (link: Omit<GroupLink, 'id'>) => void;
  isAddingLink?: boolean;
}

/**
 * Link zum Projekt hinzufügen (nur Admins). Wird nur gerendert, solange er offen ist —
 * der Zustand verfällt so beim Schließen von selbst. URL zuerst, Titel und Symbol
 * werden daraus vorgeschlagen.
 */
export function AddLinkDialog({ onClose, onAddLink, isAddingLink }: AddLinkDialogProps) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('globe');
  const [iconManual, setIconManual] = useState(false);
  const [titleManual, setTitleManual] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  const submit = () => {
    if (!title.trim() || !url.trim()) return;
    if (!/^https?:\/\/.+/.test(url.trim())) {
      setUrlError('URL muss mit http:// oder https:// beginnen.');
      return;
    }
    onAddLink({
      title: title.trim(),
      url: url.trim(),
      icon,
      ...(description.trim() && { description: description.trim() }),
    });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>Link hinzufügen</DialogTitle>
        <div className="flex flex-col gap-md">
          <div className="flex flex-col gap-xs">
            <label htmlFor="add-link-url" className="text-sm font-medium text-foreground">
              URL
            </label>
            <div className="flex items-center gap-xs">
              <Input
                id="add-link-url"
                value={url}
                onChange={(e) => {
                  const val = e.target.value;
                  setUrl(val);
                  if (urlError) setUrlError(null);
                  if (!iconManual) setIcon(detectIconFromUrl(val));
                  if (!titleManual) setTitle(detectTitleFromUrl(val) ?? '');
                }}
                placeholder="https://..."
                type="url"
                className="flex-1"
              />
              {url.trim().length > 0 && (
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-md border border-grey-200 bg-background transition-colors hover:bg-grey-50 dark:border-grey-700 dark:hover:bg-grey-800"
                      title="Icon ändern"
                    >
                      {/* createElement statt `<Icon />` aus einer Variablen: sonst baut der
                          React-Compiler eine Komponente je Render. */}
                      {createElement(getLinkIcon(icon), {
                        className: 'size-4 text-primary-600 dark:text-primary-400',
                      })}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-72 p-sm">
                    <div className="grid grid-cols-6 gap-xs">
                      {LINK_ICONS.map((entry) => {
                        const IconComp = entry.icon;
                        return (
                          <button
                            key={entry.key}
                            type="button"
                            className={cn(
                              'flex cursor-pointer flex-col items-center justify-center gap-xxs rounded-md border-2 bg-transparent p-xs transition-all duration-150',
                              icon === entry.key
                                ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                                : 'border-transparent hover:border-grey-300 dark:hover:border-grey-600'
                            )}
                            onClick={() => {
                              setIcon(entry.key);
                              setIconManual(true);
                            }}
                            title={entry.label}
                          >
                            <IconComp className="size-4 text-foreground" />
                            <span className="w-full truncate text-center text-[0.55rem] text-foreground">
                              {entry.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            </div>
            {urlError && <p className="m-0 text-xs text-red-500">{urlError}</p>}
          </div>
          {url.trim().length > 0 && (
            <>
              <div className="flex flex-col gap-xs">
                <label htmlFor="add-link-title" className="text-sm font-medium text-foreground">
                  Titel
                </label>
                <Input
                  id="add-link-title"
                  value={title}
                  onChange={(e) => {
                    setTitle(e.target.value);
                    setTitleManual(true);
                  }}
                  placeholder="z.B. Signal-Gruppe"
                  maxLength={100}
                />
              </div>
              <div className="flex flex-col gap-xs">
                <label
                  htmlFor="add-link-description"
                  className="text-sm font-medium text-foreground"
                >
                  Beschreibung (optional)
                </label>
                <Input
                  id="add-link-description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Kurze Beschreibung..."
                  maxLength={300}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={submit} disabled={!title.trim() || !url.trim() || !!isAddingLink}>
            {isAddingLink ? 'Wird hinzugefügt...' : 'Link hinzufügen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
