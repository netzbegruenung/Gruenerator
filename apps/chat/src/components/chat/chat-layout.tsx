'use client';

import { useState } from 'react';
import { Sidebar } from './sidebar';
import { ChatMain } from './chat-main';
import { useAuth } from '@/hooks/useAuth';

export function ChatLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { user, logout } = useAuth();

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        userId={user?.id}
        onLogout={logout}
      />
      <main className="flex flex-1 flex-col overflow-hidden">
        <ChatMain
          onMenuClick={() => setSidebarOpen(!sidebarOpen)}
          userId={user?.id}
        />
      </main>
    </div>
  );
}
