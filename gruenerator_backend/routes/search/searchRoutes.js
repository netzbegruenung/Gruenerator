const express = require('express');
const router = express.Router();
const unifiedSearchController = require('./unifiedSearchController');

// Mount the unified search controller (handles all search modes)
router.use('/', unifiedSearchController);

module.exports = router; 