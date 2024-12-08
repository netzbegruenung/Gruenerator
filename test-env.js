require('dotenv').config();

console.log('Umgebungsvariablen Test:', {
  GCP_PROJECT_ID: process.env.GCP_PROJECT_ID || 'nicht gesetzt',
  CLOUD_ML_REGION: process.env.CLOUD_ML_REGION || 'nicht gesetzt',
  GOOGLE_APPLICATION_CREDENTIALS: process.env.GOOGLE_APPLICATION_CREDENTIALS || 'nicht gesetzt'
});

// Prüfe ob die wichtigsten Variablen gesetzt sind
const requiredVars = ['GCP_PROJECT_ID', 'GOOGLE_APPLICATION_CREDENTIALS'];
const missingVars = requiredVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('Fehlende erforderliche Umgebungsvariablen:', missingVars);
} else {
  console.log('Alle erforderlichen Umgebungsvariablen sind gesetzt! ✅');
} 