import express from 'express';

import { createLogger } from './logger.js';

const log = createLogger('Health');

export function startHealthServer(port: number): void {
  const app = express();

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'gruenerator-hocuspocus',
    });
  });

  app.listen(port, '0.0.0.0', () => {
    log.info(`Health check server listening on port ${port}`);
  });
}
