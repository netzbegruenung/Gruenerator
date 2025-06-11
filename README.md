# 🌱 Grünerator

![Version](https://img.shields.io/badge/version-1.0.0-green)
![License](https://img.shields.io/badge/license-Proprietary-blue)

Grünerator ist eine moderne Webanwendung für die KI-gestützte Erstellung von Texten, speziell entwickelt für Mitglieder und Unterstützer der Grünen.

## 🚀 Features

- ✨ KI-basierte Textvorschläge
- 📱 Als PWA auf mobilen Geräten nutzbar
- 🔒 Datenschutzfreundlich (keine Cookies)
- 💫 Intuitive Benutzeroberfläche

## 🛠️ Tech Stack

- **Frontend:** React.js
- **Backend:** Node.js
- **KI-Integration:** Claude AI
- **Styling:** CSS/SCSS

## ⚙️ Installation

### Voraussetzungen
- Node.js (>= 14.x)
- npm oder yarn
- Git

### Frontend & Backend Setup
```sh
# Repository klonen
git clone https://github.com/movm/gruenerator.git
cd gruenerator

# Backend Setup
cd gruenerator_backend
npm install
cp .env.example .env  # Konfiguriere deine Umgebungsvariablen
npm start

# Frontend Setup (in neuem Terminal)
cd ../gruenerator_frontend
npm install
cp .env.example .env  # Konfiguriere deine Umgebungsvariablen
npm start
```

## 📱 Mobile Installation

Die App kann als PWA installiert werden:

1. **Android (Chrome):**
   - Öffne die Webseite
   - Tippe auf "⋮"
   - Wähle "Zum Startbildschirm hinzufügen"

2. **iOS (Safari):**
   - Öffne die Webseite
   - Tippe auf "Teilen"
   - Wähle "Zum Home-Bildschirm"

## 🤝 Contributing

Beiträge sind herzlich willkommen! Siehe [CONTRIBUTING.md](CONTRIBUTING.md) für Details.

## 📂 Projektstruktur

```
gruenerator/
├── gruenerator_frontend/   # React Frontend
├── gruenerator_backend/    # Node.js Backend
├── docs/                   # Dokumentation
└── README.md
```

## 🔑 Lizenz

Alle Rechte vorbehalten. Siehe [LICENSE.md](LICENSE.md)

## 📞 Support & Kontakt

- **Email:** [info@moritz-waechter.de](mailto:info@moritz-waechter.de)
- **Issues:** Bitte nutze den GitHub Issue Tracker

## 🙏 Danksagungen

- Netzbegrünung für technischen und inhaltlichen Support
- Allen Mitwirkenden und Unterstützern

## Authentik Multi-Source SSO Configuration

Der Grünerator unterstützt drei verschiedene Anmeldemöglichkeiten über Authentik:

1. **Grünerator Login** - Email/Password (Built-in Authentication)
2. **Netzbegrünung Login** - SAML SSO 
3. **Grünes Netz Login** - SAML SSO (coming soon)

### Setup

```bash
# 1. API Token in Authentik erstellen und setzen
export AUTHENTIK_API_TOKEN="ak_your_token_here"

# 2. Sources automatisch konfigurieren
cd gruenerator_backend
npm run setup:authentik-sources:dry-run  # Vorschau
npm run setup:authentik-sources          # Ausführen

# 3. Manuelle Validation der SAML Sources
# Siehe: docs/setup/AUTHENTIK_SOURCES_CONFIGURATION.md
```

Detaillierte Anleitung: [`docs/setup/AUTHENTIK_SOURCES_CONFIGURATION.md`](docs/setup/AUTHENTIK_SOURCES_CONFIGURATION.md)
