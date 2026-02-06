'use client';

import { ChatLayout } from '@/components/chat/chat-layout';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

export default function HomePage() {
  return (
    <ProtectedRoute>
      <ChatLayout />
    </ProtectedRoute>
  );
}
