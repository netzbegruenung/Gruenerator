import { Brain, Server, Sparkles, Zap } from 'lucide-react';

import type { ModelOption } from '../stores/chatStore';

export const MODEL_ICONS: Record<ModelOption['icon'], typeof Sparkles> = {
  sparkles: Sparkles,
  server: Server,
  zap: Zap,
  brain: Brain,
};
