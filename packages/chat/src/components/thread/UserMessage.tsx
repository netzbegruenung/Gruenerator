'use client';

import { useState } from 'react';
import {
  MessagePrimitive,
  useMessage,
  useMessageQuote,
  useMessageRuntime,
} from '@assistant-ui/react';
import { Pencil } from 'lucide-react';
import { UserMessageAttachments } from '../assistant-ui/attachment';
import { useAgentStore } from '../../stores/chatStore';
import { useChatConfigStore } from '../../stores/chatConfigStore';
import { MessageBranchPicker } from '../message-parts/MessageBranchPicker';
import { useChatDensity } from './chatDensityContext';

function QuoteBlock() {
  const quote = useMessageQuote();
  if (!quote) return null;

  return (
    <div className="mb-2 border-l-2 border-primary-300/60 pl-3 text-sm italic text-foreground-muted">
      {quote.text}
    </div>
  );
}

/** Inline editor for a user message — resubmits and re-runs the turn on save. */
function UserMessageEditor({ initialText, onDone }: { initialText: string; onDone: () => void }) {
  const runtime = useMessageRuntime();
  const [text, setText] = useState(initialText);

  const save = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    // Tell the backend to truncate from this (persisted) message before the
    // fresh reply is written, so the edited turn replaces the old one.
    const threadId = useAgentStore.getState().currentThreadId;
    const messageId = runtime.getState().id;
    if (threadId) useChatConfigStore.getState().signalEditResubmit(threadId, messageId);
    runtime.composer.setText(trimmed);
    runtime.composer.send();
    onDone();
  };

  const cancel = () => {
    runtime.composer.cancel();
    onDone();
  };

  return (
    <div className="flex flex-col gap-2">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus
        rows={Math.min(8, Math.max(1, text.split('\n').length))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            save();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            cancel();
          }
        }}
        className="w-full resize-none rounded-2xl bg-user-bubble px-4 py-3 text-foreground outline-none ring-1 ring-primary/30 focus:ring-primary/60"
      />
      <div className="flex justify-end gap-2 text-sm">
        <button
          type="button"
          onClick={cancel}
          className="rounded-lg px-3 py-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
        >
          Abbrechen
        </button>
        <button
          type="button"
          onClick={save}
          className="rounded-lg bg-primary px-3 py-1 font-medium text-primary-foreground hover:bg-primary/90"
        >
          Senden
        </button>
      </div>
    </div>
  );
}

export function UserMessage() {
  const message = useMessage();
  const runtime = useMessageRuntime();
  const density = useChatDensity();
  const isCompact = density === 'compact';
  const [editing, setEditing] = useState(false);
  const custom = message.metadata?.custom as
    | { senderId?: string; senderName?: string; roleName?: string }
    | undefined;
  const senderId = custom?.senderId;
  const storeRoleName = useAgentStore((s) =>
    s.threadMode === 'eigener' ? s.customRoleName : null
  );
  const roleName = custom?.roleName || storeRoleName;

  const beginEdit = () => {
    runtime.composer.beginEdit();
    setEditing(true);
  };

  const currentText = (() => {
    const part = message.content.find(
      (p): p is { type: 'text'; text: string } => p.type === 'text'
    );
    return part?.text ?? '';
  })();

  return (
    <MessagePrimitive.Root
      className={
        isCompact
          ? 'group mx-auto flex w-full min-w-0 justify-end'
          : 'group mx-auto flex w-full min-w-0 max-w-3xl justify-end'
      }
    >
      <div className={isCompact ? 'max-w-[92%]' : 'max-w-[85%]'}>
        {senderId && (
          <p className="mb-1 text-right text-xs text-grey-400">
            {custom?.senderName || 'Teammitglied'}
          </p>
        )}
        {roleName && (
          <p className="mb-1 text-right text-[11px] font-medium text-primary-600 dark:text-primary-400">
            Als {roleName}
          </p>
        )}
        {editing ? (
          <UserMessageEditor initialText={currentText} onDone={() => setEditing(false)} />
        ) : (
          <>
            <div
              className={
                isCompact
                  ? 'rounded-2xl bg-user-bubble px-3 py-2 text-[13px]'
                  : 'rounded-3xl bg-user-bubble px-4 py-3'
              }
            >
              <UserMessageAttachments />
              <QuoteBlock />
              <div className="whitespace-pre-wrap break-words text-foreground">
                <MessagePrimitive.Parts />
              </div>
            </div>
            <div className="mt-1 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <MessageBranchPicker />
              <button
                type="button"
                onClick={beginEdit}
                className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
                aria-label="Bearbeiten"
                title="Bearbeiten"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </MessagePrimitive.Root>
  );
}
