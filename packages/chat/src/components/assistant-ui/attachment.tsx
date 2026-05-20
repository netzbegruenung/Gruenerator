'use client';

import { PropsWithChildren, useEffect, useState, type FC } from 'react';
import { XIcon, PlusIcon, FileText, FileSearch, Cloud } from 'lucide-react';
import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui,
} from '@assistant-ui/react';
import { useShallow } from 'zustand/shallow';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from '@gruenerator/ui';
import { TooltipIconButton } from './tooltip-icon-button';

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      setSrc(undefined);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setSrc(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [file]);

  return src;
};

const useAttachmentSrc = () => {
  const { file, src } = useAuiState(
    useShallow((s): { file?: File; src?: string } => {
      if (s.attachment.type !== 'image') return {};
      if (s.attachment.file) return { file: s.attachment.file };
      const src = s.attachment.content?.filter((c) => c.type === 'image')[0]?.image;
      if (!src) return {};
      return { src };
    })
  );

  return useFileSrc(file) ?? src;
};

type AttachmentPreviewProps = {
  src: string;
};

const AttachmentPreview: FC<AttachmentPreviewProps> = ({ src }) => {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <img
      src={src}
      alt="Image Preview"
      className={cn(
        'block h-auto max-h-[80vh] w-auto max-w-full object-contain',
        isLoaded
          ? 'aui-attachment-preview-image-loaded'
          : 'aui-attachment-preview-image-loading invisible'
      )}
      onLoad={() => setIsLoaded(true)}
    />
  );
};

const AttachmentPreviewDialog: FC<PropsWithChildren> = ({ children }) => {
  const src = useAttachmentSrc();

  if (!src) return children;

  return (
    <Dialog>
      <DialogTrigger
        className="aui-attachment-preview-trigger cursor-pointer transition-colors hover:bg-grey-200 dark:hover:bg-grey-700"
        asChild
      >
        {children}
      </DialogTrigger>
      <DialogContent className="aui-attachment-preview-dialog-content p-2 sm:max-w-3xl [&>button]:rounded-full [&>button]:bg-foreground/60 [&>button]:p-1 [&>button]:opacity-100 [&>button]:ring-0! [&_svg]:text-background [&>button]:hover:[&_svg]:text-destructive">
        <DialogTitle className="aui-sr-only sr-only">Image Attachment Preview</DialogTitle>
        <div className="aui-attachment-preview relative mx-auto flex max-h-[80dvh] w-full items-center justify-center overflow-hidden bg-background">
          <AttachmentPreview src={src} />
        </div>
      </DialogContent>
    </Dialog>
  );
};

const AttachmentThumb: FC = () => {
  const isImage = useAuiState((s) => s.attachment.type === 'image');
  const src = useAttachmentSrc();

  return (
    <Avatar className="aui-attachment-tile-avatar h-full w-full rounded-none">
      <AvatarImage
        src={src}
        alt="Attachment preview"
        className="aui-attachment-tile-image object-cover"
      />
      <AvatarFallback delayMs={isImage ? 200 : 0}>
        <FileText className="aui-attachment-tile-fallback-icon size-8 text-muted-foreground" />
      </AvatarFallback>
    </Avatar>
  );
};

const GruenAttachmentChip: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source === 'composer';
  const { name, contentType } = useAuiState(
    useShallow((s) => ({
      name: s.attachment.name,
      contentType: s.attachment.contentType,
    }))
  );

  const isCollab = contentType === 'application/x-gruenerator-collab-doc';
  const isWolke = contentType === 'application/x-gruenerator-wolke';
  const Icon = isWolke ? Cloud : isCollab ? FileText : FileSearch;
  const variant = isWolke
    ? 'bg-sky-500/10 text-sky-900 border-sky-500/30 dark:text-sky-100'
    : isCollab
      ? 'bg-cyan-500/10 text-cyan-900 border-cyan-500/30 dark:text-cyan-100'
      : 'bg-primary/5 text-foreground border-primary/20';

  return (
    <AttachmentPrimitive.Root
      className={cn(
        'aui-attachment-root relative inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium max-w-[18rem]',
        variant
      )}
    >
      <Icon className="h-3 w-3 flex-shrink-0" />
      <span className="truncate">{name}</span>
      {isComposer && (
        <AttachmentPrimitive.Remove asChild>
          <button
            type="button"
            aria-label={`Erwähnung ${name} entfernen`}
            className="flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-full opacity-60 transition-opacity hover:opacity-100"
          >
            <XIcon className="h-3 w-3" />
          </button>
        </AttachmentPrimitive.Remove>
      )}
    </AttachmentPrimitive.Root>
  );
};

const AttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source === 'composer';

  const isImage = useAuiState((s) => s.attachment.type === 'image');
  const isGruenMention = useAuiState((s) =>
    (s.attachment.contentType ?? '').startsWith('application/x-gruenerator-')
  );
  const typeLabel = useAuiState((s) => {
    const type = s.attachment.type;
    switch (type) {
      case 'image':
        return 'Image';
      case 'document':
        return 'Document';
      case 'file':
        return 'File';
      default:
        return 'File';
    }
  });

  if (isGruenMention) return <GruenAttachmentChip />;

  return (
    <Tooltip>
      <AttachmentPrimitive.Root
        className={cn(
          'aui-attachment-root relative',
          isImage && 'aui-attachment-root-composer only:[&>#attachment-tile]:size-24'
        )}
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'aui-attachment-tile size-14 cursor-pointer overflow-hidden rounded-[14px] border bg-muted transition-opacity hover:opacity-75',
                isComposer && 'aui-attachment-tile-composer border-foreground/20'
              )}
              role="button"
              id="attachment-tile"
              aria-label={`${typeLabel} attachment`}
            >
              <AttachmentThumb />
            </div>
          </TooltipTrigger>
        </AttachmentPreviewDialog>
        {isComposer && <AttachmentRemove />}
      </AttachmentPrimitive.Root>
      <TooltipContent side="top">
        <AttachmentPrimitive.Name />
      </TooltipContent>
    </Tooltip>
  );
};

const AttachmentRemove: FC = () => {
  return (
    <AttachmentPrimitive.Remove asChild>
      <TooltipIconButton
        tooltip="Remove file"
        className="aui-attachment-tile-remove absolute top-1.5 right-1.5 size-3.5 rounded-full bg-white text-muted-foreground opacity-100 shadow-sm hover:bg-white! [&_svg]:text-foreground hover:[&_svg]:text-destructive"
        side="top"
      >
        <XIcon className="aui-attachment-remove-icon size-3 dark:stroke-[2.5px]" />
      </TooltipIconButton>
    </AttachmentPrimitive.Remove>
  );
};

export const UserMessageAttachments: FC = () => {
  return (
    <div className="aui-user-message-attachments-end col-span-full col-start-1 row-start-1 flex w-full flex-row justify-end gap-2">
      <MessagePrimitive.Attachments components={{ Attachment: AttachmentUI }} />
    </div>
  );
};

export const ComposerAttachments: FC = () => {
  return (
    <div className="aui-composer-attachments mx-4 mt-3 mb-1 flex flex-row items-center gap-2 overflow-x-auto empty:hidden">
      <ComposerPrimitive.Attachments components={{ Attachment: AttachmentUI }} />
    </div>
  );
};

export const ComposerAddAttachment: FC = () => {
  return (
    <ComposerPrimitive.AddAttachment asChild>
      <TooltipIconButton
        tooltip="Add Attachment"
        side="bottom"
        variant="ghost"
        size="icon"
        className="aui-composer-add-attachment size-8.5 rounded-full p-1 font-semibold text-xs hover:bg-muted-foreground/15 dark:border-muted-foreground/15 dark:hover:bg-muted-foreground/30"
        aria-label="Add Attachment"
      >
        <PlusIcon className="aui-attachment-add-icon size-5 stroke-[1.5px]" />
      </TooltipIconButton>
    </ComposerPrimitive.AddAttachment>
  );
};
