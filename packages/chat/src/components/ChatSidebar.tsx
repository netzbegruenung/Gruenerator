'use client';

import { useState } from 'react';
import { cn } from '../lib/utils';
import { PanelLeftClose, Sun, Moon, LogOut, MoreVertical } from 'lucide-react';
import { useTheme } from './ThemeProvider';
import { ChatThreadList } from './ChatThreadList';
import { ChatIcon } from './icons';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  userId?: string;
  onLogout?: () => void;
}

export function ChatSidebar({ isOpen, onToggle, userId, onLogout }: SidebarProps) {
  const { theme, setTheme } = useTheme();

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={onToggle} />}

      <aside
        className={cn(
          'fixed left-0 top-0 z-50 flex h-full flex-col border-r border-border bg-background transition-all duration-300',
          'lg:relative lg:z-auto',
          isOpen
            ? 'w-72 translate-x-0'
            : '-translate-x-full lg:w-0 lg:translate-x-0 lg:overflow-hidden lg:border-r-0'
        )}
      >
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2">
            <ChatIcon size={28} />
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

        <ChatThreadList />

        <SidebarFooter
          theme={theme}
          onThemeToggle={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          onLogout={onLogout}
        />
      </aside>
    </>
  );
}

interface SidebarFooterProps {
  theme: string;
  onThemeToggle: () => void;
  onLogout?: () => void;
}

function SidebarFooter({ theme, onThemeToggle, onLogout }: SidebarFooterProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="chat-sidebar-footer">
      <button
        onClick={onThemeToggle}
        className="sidebar-icon-button"
        aria-label={theme === 'dark' ? 'Zum hellen Modus wechseln' : 'Zum dunklen Modus wechseln'}
      >
        {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
      </button>

      {onLogout && (
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
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="menu-dropdown-content">
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
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
