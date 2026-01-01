import express from 'express';
const router = express.Router();
import { search } from './searchController.js';

router.post('/', search);

export default router;