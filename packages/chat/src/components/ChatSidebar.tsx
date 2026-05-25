'use client';

// Chat conversation sidebar — thread list + theme/account footer. NOT the docs chat panel (packages/docs/src/components/chat/ChatSidebar.tsx).
import { useState } from 'react';
import { cn } from '../lib/utils';
import { Sun, Moon, Monitor, LogOut, MoreVertical } from 'lucide-react';
import { useTheme, type Theme } from './ThemeProvider';
import { ChatThreadList } from './ChatThreadList';

interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  userId?: string;
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

export function ChatSidebar({ isOpen, onToggle, userId, onLogout, onNavigate }: SidebarProps) {
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
        <ChatThreadList />

        <SidebarFooter theme={theme} onThemeChange={setTheme} onLogout={onLogout} />
      </aside>
    </>
  );
}

interface SidebarFooterProps {
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  onLogout?: () => void;
}

const THEME_OPTIONS: { value: Theme; Icon: typeof Sun; label: string }[] = [
  { value: 'light', Icon: Sun, label: 'Helles Design' },
  { value: 'dark', Icon: Moon, label: 'Dunkles Design' },
  { value: 'system', Icon: Monitor, label: 'Automatisches Design' },
];

function SidebarFooter({ theme, onThemeChange, onLogout }: SidebarFooterProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="chat-sidebar-footer">
      <div className="sidebar-theme-switch" role="group" aria-label="Erscheinungsbild">
        {THEME_OPTIONS.map(({ value, Icon, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onThemeChange(value)}
            className="sidebar-icon-button"
            data-active={theme === value}
            aria-pressed={theme === value}
            aria-label={label}
            title={label}
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>

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
