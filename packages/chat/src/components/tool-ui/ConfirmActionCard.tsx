import {
  FileText,
  Pencil,
  LayoutGrid,
  Share2,
  Users,
  UserPlus,
  Cloud,
  FolderInput,
  Eye,
  Repeat,
  Bot,
  Check,
  X,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { useState, memo } from 'react';

import { confirmChatAction } from '../../lib/confirmAction';

import type { ConfirmActionData, ConfirmActionType } from '../../types/messageMetadata';

type CardStatus = 'idle' | 'loading' | 'confirmed' | 'rejected' | 'error' | 'expired';

const ICON_MAP: Record<ConfirmActionType, typeof FileText> = {
  save_as_doc: FileText,
  modify_doc: Pencil,
  modify_board: LayoutGrid,
  share_doc: Share2,
  create_group: Users,
  join_group: UserPlus,
  add_cloud_connection: Cloud,
  attach_wolke_folder: FolderInput,
  set_notebook_visibility: Eye,
  share_notebook: Share2,
  set_group_visibility: Eye,
  create_recurring_task: Repeat,
  create_user_agent: Bot,
  share_user_agent: Share2,
};

const GROUP_ACTION_TYPES: ReadonlySet<ConfirmActionType> = new Set([
  'create_group',
  'join_group',
  // Die Karte verlinkt danach das Projekt, nicht das Notebook.
  'share_notebook',
  'set_group_visibility',
  'share_user_agent',
]);
const NOTEBOOK_ACTION_TYPES: ReadonlySet<ConfirmActionType> = new Set([
  'attach_wolke_folder',
  'set_notebook_visibility',
]);

export const ConfirmActionCard = memo(function ConfirmActionCard({
  action,
}: {
  action: ConfirmActionData;
}) {
  const [status, setStatus] = useState<CardStatus>('idle');
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const Icon = ICON_MAP[action.type] || FileText;

  async function handleConfirm(confirmed: boolean) {
    setStatus('loading');
    const outcome = await confirmChatAction(action, confirmed);
    if (outcome.status === 'error') {
      setErrorMessage(outcome.message);
      setStatus('error');
      return;
    }
    if (outcome.status === 'confirmed' && outcome.url) {
      // /document/<id> is the API's canonical path; the web office route is /office/<id>.
      setResultUrl(
        outcome.url.startsWith('/document/')
          ? `/office/${outcome.url.replace('/document/', '')}`
          : outcome.url
      );
    }
    setStatus(outcome.status);
  }

  if (status === 'confirmed') {
    return (
      <div className="my-2 text-sm">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-primary/5 px-2.5 py-1">
          <Check className="h-3.5 w-3.5 text-primary" />
          <span className="font-medium text-foreground">{action.title}</span>
          {resultUrl && (
            <>
              <span className="text-foreground-muted">&middot;</span>
              <a
                href={resultUrl}
                className="inline-flex items-center gap-1 text-primary hover:text-primary/80 transition-colors"
              >
                {action.type === 'modify_board'
                  ? 'Board öffnen'
                  : action.type === 'create_recurring_task'
                    ? 'Aufgaben öffnen'
                    : action.type === 'create_user_agent'
                      ? 'Grünerator-Agent öffnen'
                      : GROUP_ACTION_TYPES.has(action.type)
                        ? 'Gruppe öffnen'
                        : NOTEBOOK_ACTION_TYPES.has(action.type)
                          ? 'Notebook öffnen'
                          : 'Dokument öffnen'}
                <ArrowRight className="h-3 w-3" />
              </a>
            </>
          )}
        </div>
      </div>
    );
  }

  if (status === 'rejected' || status === 'expired') {
    const label = status === 'rejected' ? 'Abgebrochen' : 'Aktion abgelaufen';
    return (
      <div className="my-2 text-sm">
        <div className="inline-flex items-center gap-1.5 rounded-full bg-grey-100 dark:bg-grey-800 px-2.5 py-1">
          <X className="h-3.5 w-3.5 text-foreground-muted" />
          <span className="text-foreground-muted">{label}</span>
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="my-5 rounded-xl border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 px-4 py-3">
        <p className="text-sm text-red-700 dark:text-red-400 mb-2">{errorMessage}</p>
        <button
          onClick={() => {
            setStatus('idle');
            setErrorMessage(null);
          }}
          className="px-3 py-1.5 text-sm rounded-full border border-primary/30 bg-background text-foreground hover:bg-primary/10 hover:border-primary/50 transition-colors cursor-pointer"
        >
          Erneut versuchen
        </button>
      </div>
    );
  }

  return (
    <div className="my-5 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <div className="flex items-start gap-2 mb-2">
        <Icon className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
        <div>
          <p className="text-sm font-medium text-foreground">{action.title}</p>
          {action.description && (
            <p className="text-xs text-foreground-muted mt-0.5">{action.description}</p>
          )}
        </div>
      </div>

      {action.metadata.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 ml-6 text-xs text-foreground-muted">
          {action.metadata.map((m) => (
            <span key={m.key}>
              {m.key}: <span className="text-foreground">{m.value}</span>
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 ml-6">
        <button
          onClick={() => handleConfirm(true)}
          disabled={status === 'loading'}
          className="px-3 py-1.5 text-sm rounded-full bg-primary text-white hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer inline-flex items-center gap-1.5"
        >
          {status === 'loading' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          {action.confirmLabel}
        </button>
        <button
          onClick={() => handleConfirm(false)}
          disabled={status === 'loading'}
          className="px-3 py-1.5 text-sm rounded-full border border-grey-300 dark:border-grey-600 bg-background text-foreground hover:bg-grey-100 dark:hover:bg-grey-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {action.cancelLabel}
        </button>
      </div>
    </div>
  );
});
