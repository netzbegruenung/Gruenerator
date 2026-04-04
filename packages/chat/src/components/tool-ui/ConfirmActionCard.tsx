import { useState, memo } from 'react';
import { FileText, Pencil, LayoutGrid, Check, X, ArrowRight, Loader2 } from 'lucide-react';
import type { ConfirmActionData, ConfirmActionType } from '../../types/messageMetadata';
import { useChatConfigStore } from '../../stores/chatConfigStore';

type CardStatus = 'idle' | 'loading' | 'confirmed' | 'rejected' | 'error' | 'expired';

const ICON_MAP: Record<ConfirmActionType, typeof FileText> = {
  save_as_doc: FileText,
  modify_doc: Pencil,
  modify_board: LayoutGrid,
};

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
    try {
      const { fetch: configFetch, endpoints } = useChatConfigStore.getState();
      const response = await configFetch(endpoints.chatConfirm, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          threadId: action.threadId,
          actionId: action.actionId,
          confirmed,
        }),
      });

      if (response.status === 404) {
        setStatus('expired');
        return;
      }

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        setErrorMessage(data?.error || 'Fehler bei der Ausführung.');
        setStatus('error');
        return;
      }

      if (!confirmed) {
        setStatus('rejected');
        return;
      }

      const data = await response.json();
      if (data.url) {
        const isDocsUrl = data.url.startsWith('/document/');
        if (isDocsUrl) {
          const docId = data.url.replace('/document/', '');
          setResultUrl(`/docs/${docId}`);
        } else {
          setResultUrl(data.url);
        }
      }
      setStatus('confirmed');
    } catch {
      setErrorMessage('Verbindungsfehler. Bitte versuche es erneut.');
      setStatus('error');
    }
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
                {action.type === 'modify_board' ? 'Board öffnen' : 'Dokument öffnen'}
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
      <div className="my-3 rounded-lg border border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 p-3">
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
    <div className="my-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
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
