'use client';

import { ChatProvider, ChatLayout } from '@gruenerator/chat';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/hooks/useAuth';
import { webChatAdapter } from '@/lib/chatAdapter';

export default function HomePage() {
  return (
    <ProtectedRoute>
      <ChatPage />
    </ProtectedRoute>
  );
}

function ChatPage() {
  const { user, logout } = useAuth();

  return (
    <ChatProvider adapter={webChatAdapter}>
      <ChatLayout userId={user?.id} onLogout={logout} />
    </ChatProvider>
  );
}
