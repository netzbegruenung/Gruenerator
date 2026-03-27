import {
  Checkbox,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@gruenerator/ui';
import {
  CheckCircle,
  Clock,
  Eye,
  FileText,
  Loader2,
  MoreVertical,
  Trash2,
  XCircle,
} from 'lucide-react';
import { memo } from 'react';

import type { Document } from '../../../types/documents';

import { cn } from '@/utils/cn';

interface DocumentRowProps {
  document: Document;
  isSelected: boolean;
  onToggle: (documentId: string) => void;
  onView: (documentId: string) => void;
  onRemove: (documentId: string) => void;
}

function getStatusDisplay(status: Document['status']) {
  switch (status) {
    case 'completed':
      return { icon: CheckCircle, className: 'text-green-600', label: 'Bereit' };
    case 'processing':
      return {
        icon: Loader2,
        className: 'text-primary-500 animate-spin',
        label: 'Wird verarbeitet…',
      };
    case 'pending':
    case 'uploaded':
      return { icon: Clock, className: 'text-foreground-muted', label: 'Wartend' };
    case 'failed':
      return { icon: XCircle, className: 'text-red-500', label: 'Fehlgeschlagen' };
    default:
      return { icon: Clock, className: 'text-foreground-muted', label: '' };
  }
}

export const DocumentRow = memo(function DocumentRow({
  document,
  isSelected,
  onToggle,
  onView,
  onRemove,
}: DocumentRowProps) {
  const statusDisplay = getStatusDisplay(document.status);
  const StatusIcon = statusDisplay.icon;
  const isReady = document.status === 'completed';

  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md px-2 py-1.5 transition-colors',
        'hover:bg-background-alt'
      )}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={() => onToggle(document.id)}
        disabled={!isReady}
        className="shrink-0"
        aria-label={`${document.title} ${isSelected ? 'ausgewählt' : 'nicht ausgewählt'}`}
      />

      <FileText className="h-4 w-4 shrink-0 text-foreground-muted" />

      <button
        className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
        onClick={() => isReady && onView(document.id)}
        title={document.title}
      >
        <span className="truncate text-sm">{document.title || 'Unbenanntes Dokument'}</span>
      </button>

      <StatusIcon
        className={cn('h-3.5 w-3.5 shrink-0', statusDisplay.className)}
        aria-label={statusDisplay.label}
      />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className="rounded p-0.5 opacity-0 transition-opacity hover:bg-grey-200 group-hover:opacity-100 dark:hover:bg-grey-700"
            aria-label="Aktionen"
          >
            <MoreVertical className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem onClick={() => onView(document.id)}>
            <Eye className="h-3.5 w-3.5" />
            Anzeigen
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-red-600 focus:text-red-600"
            onClick={() => onRemove(document.id)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Entfernen
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
});
