'use client';

import { useState } from 'react';
import { ChatSidebar } from './ChatSidebar';
import { GrueneratorThread } from './thread/GrueneratorThread';
import { GrueneratorChatProvider } from '../runtime/GrueneratorChatProvider';
import { TooltipProvider } from './ui/tooltip';

interface ChatLayoutProps {
  userId?: string;
  onLogout?: () => void;
}

export function ChatLayout({ userId, onLogout }: ChatLayoutProps) {
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
          />
          <main className="flex flex-1 flex-col overflow-hidden">
            <GrueneratorThread
              sidebarOpen={sidebarOpen}
              onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
            />
          </main>
        </div>
      </TooltipProvider>
    </GrueneratorChatProvider>
  );
}
