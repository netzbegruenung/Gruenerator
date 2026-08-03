import { setupServer } from 'msw/node';

// Shared MSW server for the jsdom test lane. No default handlers — each test
// registers its own with `server.use(...)`; vitest.setup.ts wires
// listen/resetHandlers/close around the suite.
export const server = setupServer();
