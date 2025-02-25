const express = require('express');
const searchQueryRouter = require('./searchQuery');
const antragRouter = require('./antrag');
const antragSimpleRouter = require('./antrag_simple');

/**
 * Claude-API-Router
 * Bündelt die Endpoints für Suchanfragen und Anträge
 */
const router = express.Router();

// Logging für Routenregistrierung
console.log('Claude-Router wird initialisiert');

// Routen registrieren
router.use('/', searchQueryRouter);
router.use('/', antragRouter);
router.use('/antrag-simple', antragSimpleRouter);

// Middleware für Anfrage-Logging
router.use((req, res, next) => {
  console.log(`Claude-API-Anfrage: ${req.method} ${req.originalUrl}`);
  next();
});

console.log('Claude-Router erfolgreich initialisiert');

module.exports = router; 