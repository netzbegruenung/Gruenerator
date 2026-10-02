import { type NotifyKind } from '@gruenerator/chat';
import { create } from 'zustand';

export interface Notice {
  id: number;
  kind: NotifyKind;
  message: string;
  description?: string;
}

interface NoticeState {
  notice: Notice | null;
  show: (kind: NotifyKind, message: string, description?: string) => void;
  dismiss: (id: number) => void;
}

let nextId = 0;

/**
 * Der eine Hinweis, den `NoticeToast` gerade zeigt — das native Gegenstück zu
 * web's sonner-Toasts aus `notifyError`/`notifyWarning`. Ein neuer Hinweis
 * ersetzt den alten: eine Schlange würde eine Störung, die drei Warnungen
 * hintereinander auslöst, noch zeigen, wenn sie längst vorbei ist.
 */
export const useNoticeStore = create<NoticeState>((set) => ({
  notice: null,
  show: (kind, message, description) =>
    set({ notice: { id: ++nextId, kind, message, ...(description ? { description } : {}) } }),
  // Per id, damit der Timer eines alten Hinweises nicht den neuen abräumt.
  dismiss: (id) => set((state) => (state.notice?.id === id ? { notice: null } : state)),
}));
