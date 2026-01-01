import express from 'express';
const router = express.Router();
import unifiedSearchController from './unifiedSearchController.js';

// Mount the unified search controller (handles all search modes)
router.use('/', unifiedSearchController);

export default router;