const express = require('express');
const router = express.Router();
const searchController = require('./searchController');
const deepResearchController = require('./deepResearchController');

// Mount the existing search controller (which handles POST /)
router.use('/', searchController);

// Add the deep research route
router.use('/deep-research', deepResearchController);

module.exports = router; 