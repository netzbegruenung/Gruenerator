        // gruenerator_backend/utils/redisClient.js
        const { createClient } = require('redis');
        require('dotenv').config(); // Stellt sicher, dass .env geladen wird

        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            console.error('REDIS_URL ist nicht in der Umgebung konfiguriert!');
            // Im Fehlerfall beenden, wenn Redis essenziell ist
            process.exit(1); 
        }

        // createClient verwendet automatisch TLS, wenn die URL mit rediss:// beginnt
        const client = createClient({
            url: redisUrl
        });

        client.on('error', (err) => console.error('Upstash Redis Client Fehler:', err));
        client.on('connect', () => console.log('Erfolgreich mit Upstash Redis verbunden'));
        client.on('reconnecting', () => console.log('Verbinde neu mit Upstash Redis...'));

        // Verbindungsversuch beim Start (asynchron)
        client.connect().catch(err => {
            console.error('Fehler beim initialen Verbinden mit Upstash Redis:', err);
            // Optional: Prozess beenden, wenn Verbindung kritisch ist
            // process.exit(1); 
        });

        // Exportiere den verbundenen Client für andere Module
        module.exports = client;