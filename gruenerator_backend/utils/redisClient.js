        // gruenerator_backend/utils/redisClient.js
        const { createClient } = require('redis');
        require('dotenv').config(); // Stellt sicher, dass .env geladen wird

        const redisUrl = process.env.REDIS_URL;
        if (!redisUrl) {
            console.error('REDIS_URL ist nicht in der Umgebung konfiguriert!');
            // Im Fehlerfall nicht beenden, App soll weiterlaufen
            // process.exit(1); 
        }

        // Log the URL being used (mask password for security)
        const maskedUrl = redisUrl.replace(/:\/\/(.*:)?(.*)@/, '://<user>:<password>@');
        console.log(`Versuche Verbindung mit Redis: ${maskedUrl}`);

        // createClient verwendet automatisch TLS, wenn die URL mit rediss:// beginnt
        const client = createClient({
            url: redisUrl,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 5) { // Limit retries to 5
                        console.log('Maximale Anzahl an Redis-Wiederverbindungsversuchen erreicht. Stoppe Versuche.');
                        // Return an error to stop retrying
                        return new Error('Zu viele Wiederverbindungsversuche.'); 
                    }
                    // Exponential backoff: wait 100ms, 200ms, 400ms, 800ms, 1600ms
                    return Math.min(retries * 100, 2000); 
                }
            }
        });

        client.on('error', (err) => console.error('Redis Client Fehler:', err.message)); // Log only the message
        client.on('connect', () => console.log('Erfolgreich mit Redis verbunden'));
        client.on('reconnecting', (attempt) => console.log(`Verbinde neu mit Redis... Versuch ${attempt}`)); // Log attempt number

        // Verbindungsversuch beim Start (asynchron)
        client.connect().catch(err => {
            // Log the specific connection error
            console.error(`Fehler beim initialen Verbinden mit Redis (${maskedUrl}):`, err.message);
            // Optional: Prozess beenden, wenn Verbindung kritisch ist
            // process.exit(1); 
        });

        // Exportiere den verbundenen Client für andere Module
        module.exports = client;