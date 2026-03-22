'use client';

import { useState } from 'react';
import { ChatSidebar } from './ChatSidebar';
import { GrueneratorThread } from './thread/GrueneratorThread';
import { GrueneratorChatProvider } from '../runtime/GrueneratorChatProvider';
import { TooltipProvider } from '@gruenerator/ui';

interface ChatLayoutProps {
  userId?: string;
  firstName?: string | null;
  onLogout?: () => void;
  onNavigate?: (path: string) => void;
}

export function ChatLayout({ userId, firstName, onLogout, onNavigate }: ChatLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <GrueneratorChatProvider userId={userId}>
      <TooltipProvider>
        <div className="flex h-screen overflow-hidden bg-background">
          <ChatSidebar
            isOpen={sidebarOpen}
            onToggle={() => setSidebarOpen(!sidebarOpen)}
            userId={userId}
            onLogout={onLogout}
            onNavigate={onNavigate}
          />
          <main className="flex flex-1 flex-col overflow-hidden">
            <GrueneratorThread onNavigate={onNavigate} firstName={firstName} />
          </main>
        </div>
      </TooltipProvider>
    </GrueneratorChatProvider>
  );
}
