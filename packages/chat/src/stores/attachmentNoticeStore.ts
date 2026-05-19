import { create } from 'zustand';

export interface AttachmentNotice {
  id: string;
  title: string;
  description: string;
}

interface AttachmentNoticeState {
  notice: AttachmentNotice | null;
  setNotice: (notice: Omit<AttachmentNotice, 'id'>) => void;
  dismiss: () => void;
}

export const useAttachmentNoticeStore = create<AttachmentNoticeState>((set) => ({
  notice: null,
  setNotice: (notice) => set({ notice: { ...notice, id: crypto.randomUUID() } }),
  dismiss: () => set({ notice: null }),
}));
