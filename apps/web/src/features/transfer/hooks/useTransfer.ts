import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

interface TransferItem {
  id: string;
  shareToken: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  downloadCount: number;
  createdAt: string;
  expiresAt: string | null;
  isPasswordProtected: boolean;
}

interface UploadTransferParams {
  file: File;
  shareLinkId: string;
  folderPath?: string;
  password?: string;
  expiresInDays?: number;
  message?: string;
}

interface UploadResult {
  shareToken: string;
  shareUrl: string;
  id: string;
}

export function useTransferList() {
  return useQuery<TransferItem[]>({
    queryKey: ['transfers'],
    queryFn: async () => {
      const { data } = await apiClient.get('/transfer/list');
      return data.transfers;
    },
    staleTime: 30_000,
  });
}

export function useUploadTransfer() {
  const queryClient = useQueryClient();

  return useMutation<UploadResult, Error, UploadTransferParams>({
    mutationFn: async ({ file, shareLinkId, folderPath, password, expiresInDays, message }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('shareLinkId', shareLinkId);
      if (folderPath) {
        formData.append('folderPath', folderPath);
      }
      if (password) {
        formData.append('password', password);
      }
      if (expiresInDays !== undefined) {
        formData.append('expiresInDays', String(expiresInDays));
      }
      if (message) {
        formData.append('message', message);
      }

      const { data } = await apiClient.post('/transfer/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        timeout: 120000,
      });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
    },
  });
}

export function useDeleteTransfer() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: async (shareToken) => {
      await apiClient.delete(`/transfer/${shareToken}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transfers'] });
    },
  });
}
