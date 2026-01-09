#!/usr/bin/env tsx
import { startHocuspocusServer } from './hocuspocusServer.js';

startHocuspocusServer().catch((error) => {
  console.error('Failed to start Hocuspocus server:', error);
  process.exit(1);
});
