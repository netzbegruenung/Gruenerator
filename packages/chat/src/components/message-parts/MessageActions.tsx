'use client';

import { useState } from 'react';
import { Copy, Check, Download, Loader2 } from 'lucide-react';
import { useChatAdapter } from '../../context/ChatContext';
import type { ChatMessage } from '../../hooks/useChatGraphStream';

interface MessageActionsProps {
  content: string;
  metadata?: ChatMessage['metadata'];
}

export function MessageActions({ content, metadata }: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const adapter = useChatAdapter();

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportDocx = async () => {
    if (isExporting) return;
    setIsExporting(true);

    try {
      const apiBaseUrl = adapter.getApiBaseUrl();
      const response = await adapter.fetch(`${apiBaseUrl}/api/exports/chat-message`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          role: 'assistant',
          timestamp: Date.now(),
          metadata,
        }),
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const contentDisposition = response.headers.get('Content-Disposition');
      const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
      const filename = filenameMatch?.[1] || 'chat-nachricht.docx';

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Export error:', error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
      <button
        onClick={handleCopy}
        className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
        aria-label="Kopieren"
      >
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      </button>
      <button
        onClick={handleExportDocx}
        disabled={isExporting}
        className="rounded-lg p-1.5 text-foreground-muted hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
        aria-label="Als Word-Dokument exportieren"
      >
        {isExporting ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>
    </div>
  );
}
