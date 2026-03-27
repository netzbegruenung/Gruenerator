import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Textarea,
} from '@gruenerator/ui';
import { Check } from 'lucide-react';
import { useState, useCallback } from 'react';

import { LINK_ICONS, detectIconFromUrl } from '../config/linkIcons';

import type { GroupLink } from '../hooks/useGroups';

import { cn } from '@/utils/cn';

interface GroupLinkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (link: Omit<GroupLink, 'id'>) => void;
  isSaving: boolean;
  link?: GroupLink | null;
}

const GroupLinkDialog = ({ isOpen, onClose, onSave, isSaving, link }: GroupLinkDialogProps) => {
  const [title, setTitle] = useState(link?.title ?? '');
  const [url, setUrl] = useState(link?.url ?? '');
  const [description, setDescription] = useState(link?.description ?? '');
  const [icon, setIcon] = useState(link?.icon ?? 'globe');
  const [iconManual, setIconManual] = useState(!!link);
  const [urlError, setUrlError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setTitle(link?.title ?? '');
    setUrl(link?.url ?? '');
    setDescription(link?.description ?? '');
    setIcon(link?.icon ?? 'globe');
    setIconManual(!!link);
    setUrlError(null);
  }, [link]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
        resetForm();
      }
    },
    [onClose, resetForm]
  );

  const handleSubmit = useCallback(() => {
    if (!title.trim() || !url.trim()) return;

    if (!/^https?:\/\/.+/.test(url.trim())) {
      setUrlError('URL muss mit http:// oder https:// beginnen.');
      return;
    }

    const data: Omit<GroupLink, 'id'> = {
      title: title.trim(),
      url: url.trim(),
      icon,
    };
    if (description.trim()) {
      data.description = description.trim();
    }

    onSave(data);
    onClose();
    resetForm();
  }, [title, url, description, icon, onSave, onClose, resetForm]);

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[28rem]">
        <DialogHeader>
          <DialogTitle>{link ? 'Link bearbeiten' : 'Link hinzufügen'}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-md py-sm">
          <div className="flex flex-col gap-xs">
            <Label htmlFor="link-title">Titel</Label>
            <Input
              id="link-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="z.B. Signal-Gruppe"
              maxLength={100}
              autoFocus
            />
          </div>

          <div className="flex flex-col gap-xs">
            <Label htmlFor="link-url">URL</Label>
            <Input
              id="link-url"
              value={url}
              onChange={(e) => {
                const val = e.target.value;
                setUrl(val);
                if (urlError) setUrlError(null);
                if (!iconManual) setIcon(detectIconFromUrl(val));
              }}
              placeholder="https://..."
              type="url"
            />
            {urlError && <p className="text-xs text-red-500 m-0">{urlError}</p>}
          </div>

          <div className="flex flex-col gap-xs">
            <Label htmlFor="link-desc">Beschreibung (optional)</Label>
            <Textarea
              id="link-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Kurze Beschreibung..."
              maxLength={300}
              rows={2}
            />
          </div>

          <div className="flex flex-col gap-xs">
            <Label>Icon</Label>
            <div className="grid grid-cols-6 gap-xs">
              {LINK_ICONS.map((entry) => {
                const isSelected = icon === entry.key;
                const IconComponent = entry.icon;
                return (
                  <button
                    key={entry.key}
                    type="button"
                    className={cn(
                      'relative flex flex-col items-center justify-center gap-xxs rounded-md p-xs transition-all duration-150 border-2 cursor-pointer bg-transparent',
                      isSelected
                        ? 'border-primary-500 bg-primary-50 dark:bg-primary-950/20'
                        : 'border-transparent hover:border-grey-300 dark:hover:border-grey-600'
                    )}
                    onClick={() => {
                      setIcon(entry.key);
                      setIconManual(true);
                    }}
                    title={entry.label}
                  >
                    <IconComponent className="size-5 text-foreground" />
                    <span className="text-[0.6rem] text-foreground truncate w-full text-center">
                      {entry.label}
                    </span>
                    {isSelected && (
                      <div className="absolute -top-0.5 -right-0.5 size-3.5 rounded-full bg-primary-500 text-white flex items-center justify-center">
                        <Check className="size-2" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-xs">
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSaving}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !url.trim() || isSaving}>
            {isSaving ? 'Speichern...' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GroupLinkDialog;
