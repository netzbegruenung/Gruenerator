'use client';

import { useState } from 'react';
import { ChatSidebar } from './ChatSidebar';
import { ChatMain } from './ChatMain';

interface ChatLayoutProps {
  userId?: string;
  onLogout?: () => void;
}

export function ChatLayout({ userId, onLogout }: ChatLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <ChatSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        userId={userId}
        onLogout={onLogout}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatMain
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          userId={userId}
        />
      </main>
    </div>
  );
}
