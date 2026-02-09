'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAgentStore } from '../stores/chatStore';
import { useChatAdapter, createApiClient } from '../context/ChatContext';
import { cn } from '../lib/utils';
import {
  PanelLeftClose,
  PanelLeft,
  Plus,
  MessageSquare,
  Trash2,
  Sun,
  Moon,
  Loader2,
  RefreshCw,
  LogOut,
  MoreVertical,
} from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { AgentSelector } from './AgentSelector';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  userId?: string;
  onLogout?: () => void;
}

interface ApiThread {
  id: string;
  userId: string;
  agentId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
  lastMessage?: {
    content: string;
    role: string;
    created_at: string;
  } | null;
}

export function ChatSidebar({ isOpen, onToggle, userId, onLogout }: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const adapter = useChatAdapter();
  const apiClient = useMemo(() => createApiClient(adapter), [adapter]);
  const {
    threads,
    currentThreadId,
    setCurrentThread,
    deleteThread: deleteLocalThread,
    clearThreads,
    addThread,
  } = useAgentStore();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchThreads = useCallback(async () => {
    if (!userId) return;

    setIsLoading(true);
    setError(null);

    try {
      const apiThreads = await apiClient.get<ApiThread[]>('/api/chat-service/threads');

      clearThreads();

      const sortedThreads = [...apiThreads].sort(
        (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      );

      for (const thread of sortedThreads) {
        addThread({
          id: thread.id,
          title: thread.title,
          agentId: thread.agentId,
          createdAt: new Date(thread.createdAt),
          updatedAt: new Date(thread.updatedAt),
        });
      }
    } catch (err) {
      console.error('Error fetching threads:', err);
      setError('Fehler beim Laden der Unterhaltungen');
    } finally {
      setIsLoading(false);
    }
  }, [userId, clearThreads, addThread, apiClient]);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  const handleNewChat = () => {
    setCurrentThread(null);
  };

  const handleDeleteThread = async (threadId: string) => {
    if (!userId) return;

    deleteLocalThread(threadId);

    try {
      await apiClient.delete(`/api/chat-service/threads?threadId=${threadId}`);
    } catch (err) {
      console.error('Error deleting thread:', err);
      fetchThreads();
    }
  };

  const handleClearAllThreads = async () => {
    if (!userId || threads.length === 0) return;

    const threadIds = threads.map((t) => t.id);
    clearThreads();

    try {
      await Promise.all(
        threadIds.map((threadId) =>
          apiClient.delete(`/api/chat-service/threads?threadId=${threadId}`)
        )
      );
    } catch (err) {
      console.error('Error clearing threads:', err);
      fetchThreads();
    }
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) return 'Heute';
    if (days === 1) return 'Gestern';
    if (days < 7) return `Vor ${days} Tagen`;
    return d.toLocaleDateString('de-DE');
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onToggle}
        />
      )}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full w-72 flex-col border-r border-border bg-background transition-transform duration-300 lg:relative lg:translate-x-0',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <span className="text-xl">🌻</span>
            <span className="font-semibold text-primary">Grünerator Chat</span>
          </div>
          <button
            onClick={onToggle}
            className="rounded-lg p-2 hover:bg-primary/10"
            aria-label="Seitenleiste schließen"
          >
            <PanelLeftClose className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 scrollbar-thin">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground-muted">
              Unterhaltungen
            </h3>
            <div className="flex items-center gap-1">
              <button
                onClick={handleNewChat}
                className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground"
                aria-label="Neuer Chat"
              >
                <Plus className="h-4 w-4" />
              </button>
              {userId && (
                <button
                  onClick={fetchThreads}
                  disabled={isLoading}
                  className="rounded p-1 text-foreground-muted hover:bg-primary/10 hover:text-foreground disabled:opacity-50"
                  aria-label="Aktualisieren"
                >
                  <RefreshCw className={cn('h-4 w-4', isLoading && 'animate-spin')} />
                </button>
              )}
            </div>
          </div>

          {isLoading && threads.length === 0 ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
            </div>
          ) : error ? (
            <p className="text-sm text-red-500">{error}</p>
          ) : threads.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              Noch keine Unterhaltungen
            </p>
          ) : (
            <ul className="space-y-1">
              {threads.map((thread) => (
                <li key={thread.id}>
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => setCurrentThread(thread.id)}
                    onKeyDown={(e) => e.key === 'Enter' && setCurrentThread(thread.id)}
                    className={cn(
                      'group flex w-full cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left transition-colors',
                      currentThreadId === thread.id
                        ? 'bg-primary/10 text-primary'
                        : 'hover:bg-primary/5'
                    )}
                  >
                    <MessageSquare className="h-4 w-4 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">
                        {thread.title || 'Neue Unterhaltung'}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {formatDate(thread.updatedAt)}
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteThread(thread.id);
                      }}
                      className="opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label="Unterhaltung löschen"
                    >
                      <Trash2 className="h-4 w-4 text-foreground-muted hover:text-red-500" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <SidebarFooter
          theme={theme}
          onThemeToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onClearAll={threads.length > 0 ? handleClearAllThreads : undefined}
          onLogout={onLogout}
        />
      </aside>

      {!isOpen && (
        <button
          onClick={onToggle}
          className="fixed left-4 top-4 z-30 rounded-lg bg-background p-2 shadow-md hover:bg-primary/10 lg:hidden"
          aria-label="Seitenleiste öffnen"
        >
          <PanelLeft className="h-5 w-5" />
        </button>
      )}
    </>
  );
}

interface SidebarFooterProps {
  theme: string;
  onThemeToggle: () => void;
  onClearAll?: () => void;
  onLogout?: () => void;
}

function SidebarFooter({ theme, onThemeToggle, onClearAll, onLogout }: SidebarFooterProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  const hasMenuItems = onClearAll || onLogout;

  return (
    <div className="sidebar-footer">
      <button
        onClick={onThemeToggle}
        className="sidebar-icon-button"
        aria-label={theme === 'dark' ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      <AgentSelector />

      {hasMenuItems && (
        <div className="menu-dropdown">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="sidebar-icon-button"
            aria-label="Mehr Optionen"
          >
            <MoreVertical className="h-4 w-4" />
          </button>

          {menuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setMenuOpen(false)}
              />
              <div className="menu-dropdown-content">
                {onClearAll && (
                  <button
                    onClick={() => {
                      onClearAll();
                      setMenuOpen(false);
                    }}
                    className="menu-dropdown-item destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Alle löschen</span>
                  </button>
                )}
                {onLogout && (
                  <button
                    onClick={() => {
                      onLogout();
                      setMenuOpen(false);
                    }}
                    className="menu-dropdown-item"
                  >
                    <LogOut className="h-4 w-4" />
                    <span>Abmelden</span>
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
