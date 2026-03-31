import { toNodeHandler } from 'better-auth/node';

import { auth } from '../../config/betterAuth.js';

export const betterAuthHandler = toNodeHandler(auth);
