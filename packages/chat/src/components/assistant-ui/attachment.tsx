'use client';

import {
  AttachmentPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useAuiState,
  useAui,
} from '@assistant-ui/react';
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
import {
  ClipboardPaste,
  XIcon,
  PlusIcon,
  FileText,
  FileSearch,
  Cloud,
  Plug,
  Globe,
} from 'lucide-react';
import { type PropsWithChildren, useEffect, useState, type FC } from 'react';
import { useShallow } from 'zustand/shallow';

import {
  isPastedTextAttachment,
  PASTED_TEXT_PREVIEW_PART_NAME,
  pastedTextPreview,
} from '../../lib/pastedText';

import { TooltipIconButton } from './tooltip-icon-button';

const useFileSrc = (file: File | undefined) => {
  const [src, setSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- object URL is a side effect with a revoke cleanup; cannot be derived during render
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
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- onLoad tracks image-decode completion, not a user interaction.
    <img
      src={src}
      alt="Vorschau des Anhangs"
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
  const isConnect = contentType === 'application/x-gruenerator-connect';
  const isWebpage = contentType === 'application/x-gruenerator-webpage';
  const Icon = isConnect
    ? Plug
    : isWolke
      ? Cloud
      : isWebpage
        ? Globe
        : isCollab
          ? FileText
          : FileSearch;
  const variant = isConnect
    ? 'bg-violet-500/10 text-violet-900 border-violet-500/30 dark:text-violet-100'
    : isWolke
      ? 'bg-sky-500/10 text-sky-900 border-sky-500/30 dark:text-sky-100'
      : isWebpage
        ? 'bg-emerald-500/10 text-emerald-900 border-emerald-500/30 dark:text-emerald-100'
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

function decodeBase64Text(data: string): string {
  try {
    const binary = atob(data);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

const usePastedTextContent = () => {
  const { file, encodedText, truncated } = useAuiState(
    useShallow((s): { file?: File; encodedText?: string; truncated?: boolean } => {
      let attachmentText: string | undefined;
      let isTruncated = false;
      for (const part of s.attachment.content ?? []) {
        if (part.type === 'file') {
          attachmentText = part.data;
          break;
        }
        if (part.type === 'data' && part.name === PASTED_TEXT_PREVIEW_PART_NAME) {
          const data: unknown = part.data;
          if (
            data !== null &&
            typeof data === 'object' &&
            'text' in data &&
            typeof data.text === 'string'
          ) {
            attachmentText = data.text;
            if ('truncated' in data && typeof data.truncated === 'boolean') {
              isTruncated = data.truncated;
            }
          }
        }
      }
      return {
        ...(s.attachment.file ? { file: s.attachment.file } : {}),
        ...(attachmentText ? { encodedText: attachmentText } : {}),
        ...(isTruncated ? { truncated: true } : {}),
      };
    })
  );
  const [text, setText] = useState('');

  useEffect(() => {
    let disposed = false;
    if (file) {
      void file.text().then((value) => {
        if (!disposed) setText(value);
      });
    } else {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- attachment content changes outside React; this derives an async file payload for the preview.
      setText(encodedText ? decodeBase64Text(encodedText) || encodedText : '');
    }
    return () => {
      disposed = true;
    };
  }, [encodedText, file]);

  return { text, truncated: truncated ?? false };
};

const PastedTextAttachment: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source === 'composer';
  const { text, truncated } = usePastedTextContent();
  const preview = text ? pastedTextPreview(text) : 'Text wird vorbereitet…';

  return (
    <AttachmentPrimitive.Root className="aui-pasted-text-attachment relative shrink-0">
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="flex h-32 w-56 flex-col rounded-2xl border border-foreground/15 bg-muted/65 p-3 text-left shadow-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            aria-label="Eingefügten Text vollständig anzeigen"
          >
            <p className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-foreground-muted">
              <ClipboardPaste className="size-3.5" />
              EINGEFÜGT
            </p>
            <p className="mt-2 line-clamp-4 whitespace-pre-wrap break-words text-xs leading-4 text-foreground-muted">
              {preview}
            </p>
            {text && (
              <p className="mt-auto text-[11px] text-foreground-muted">
                {text.length.toLocaleString('de-DE')} Zeichen
              </p>
            )}
          </button>
        </DialogTrigger>
        <DialogContent className="max-h-[80dvh] overflow-hidden sm:max-w-2xl">
          <DialogTitle>Eingefügter Text</DialogTitle>
          <pre className="max-h-[62dvh] overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted p-3 font-sans text-sm leading-6 text-foreground">
            {text || 'Text wird vorbereitet…'}
          </pre>
          {truncated && (
            <p className="text-xs text-foreground-muted">
              Im Verlauf wird eine Vorschau des eingefügten Texts angezeigt.
            </p>
          )}
        </DialogContent>
      </Dialog>
      {isComposer && <AttachmentRemove />}
    </AttachmentPrimitive.Root>
  );
};

const AttachmentUI: FC = () => {
  const aui = useAui();
  const isComposer = aui.attachment.source === 'composer';

  const isImage = useAuiState((s) => s.attachment.type === 'image');
  const isPastedText = useAuiState((s) =>
    isPastedTextAttachment(s.attachment.name, s.attachment.contentType)
  );
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
  if (isPastedText) return <PastedTextAttachment />;

  return (
    <Tooltip>
      <AttachmentPrimitive.Root
        className={cn(
          'aui-attachment-root relative shrink-0',
          isImage && 'aui-attachment-root-composer'
        )}
      >
        <AttachmentPreviewDialog>
          <TooltipTrigger asChild>
            <div
              className={cn(
                'aui-attachment-tile cursor-pointer overflow-hidden rounded-[14px] border bg-muted transition-opacity hover:opacity-75',
                // Die Größe hängt am Inhaltstyp, nicht an der Anzahl: eine
                // quadratisch beschnittene Bildvorschau ist unter ~96px nicht
                // mehr identifizierbar, eine Datei-Kachel zeigt nur ein Icon.
                isImage ? 'size-24' : 'size-14',
                isComposer && 'aui-attachment-tile-composer border-foreground/20'
              )}
              role="button"
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
    <div className="aui-user-message-attachments-end mb-2 flex w-full flex-row flex-wrap justify-end gap-2 empty:hidden">
      <MessagePrimitive.Attachments components={{ Attachment: AttachmentUI }} />
    </div>
  );
};

export const ComposerAttachments: FC<{ className?: string }> = ({ className }) => {
  return (
    <div
      className={cn(
        'aui-composer-attachments mt-3 mb-1 flex flex-row items-center gap-2 overflow-x-auto empty:hidden',
        // Default matches the card layout's input inset (px-5); the pill passes
        // its own so the tile lines up with the plus button, not the text.
        className ?? 'mx-5'
      )}
    >
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
