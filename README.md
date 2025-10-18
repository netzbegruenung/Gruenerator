# 🌱 Grünerator

![Version](https://img.shields.io/badge/version-1.0.0-green)
![License](https://img.shields.io/badge/license-Proprietary-blue)

## About

Grünerator is a comprehensive AI-powered platform designed specifically for members and supporters of the German Green Party (Die Grünen). The application provides a suite of specialized AI tools for creating political content, including:

- **Text Generation**: AI-assisted creation of press releases, social media posts, proposals, and speeches
- **Sharepic Creator**: Generate professional social media graphics in seconds
- **Image Transformation**: Transform photos with AI-powered editing (Grünerator Imagine)
- **Video Subtitles**: Automatic subtitle generation for Reels and TikTok videos
- **Collaborative Editing**: Real-time collaboration features for team workflows
- **Accessibility Tools**: Tools for creating barrier-free content

Built with privacy in mind, all data is processed on European servers and never used for AI model training. The platform supports multiple authentication methods including direct login and SAML SSO integration with Green Party networks.

## 🚀 Features

- ✨ KI-basierte Textvorschläge
- 📱 Als PWA auf mobilen Geräten nutzbar
- 🔒 Datenschutzfreundlich (keine Cookies)
- 💫 Intuitive Benutzeroberfläche

## 🛠️ Tech Stack

### Frontend
- **Framework:** React 19 with Vite 7 build system
- **State Management:** Zustand + TanStack Query (React Query)
- **Routing:** React Router v7
- **Styling:** CSS Modules with CSS custom properties
- **Animation:** Motion (Framer Motion)
- **UI Components:** Radix UI primitives
- **Internationalization:** i18next with browser language detection
- **Forms:** React Hook Form

### Backend
- **Runtime:** Node.js with Express
- **Architecture:** Cluster-based with worker threads for AI processing
- **Database:** PostgreSQL
- **Authentication:** Keycloak OIDC with Passport.js
- **Session Store:** Redis with express-session
- **Real-time Collaboration:** WebSocket (Y.js)

### AI & ML
- **Primary AI:** Claude AI (Anthropic SDK)
- **Additional Models:** OpenAI, Mistral AI, AWS Bedrock
- **AI Framework:** LangChain for complex workflows
- **Vector Database:** Qdrant for embeddings and semantic search

### Media Processing
- **Video:** FFmpeg for transcoding and subtitle generation
- **Images:** Canvas API, browser-image-compression
- **Documents:** PDF (pdf-lib, pdfjs-dist), DOCX (mammoth), OCR (Tesseract.js)

### File Management
- **Upload Protocol:** TUS (resumable uploads)
- **Storage Middleware:** Multer

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

## Keycloak Multi-Source SSO Configuration

Grünerator supports three different login methods through Keycloak:

1. **Grünerator Login** - Email/Password (Built-in Authentication)
2. **Netzbegrünung Login** - SAML SSO
3. **Grünes Netz Login** - SAML SSO (coming soon)

The application uses Keycloak with OIDC (OpenID Connect) and identity brokering for multiple authentication sources. All authentication flows go through Keycloak, which handles user management and session handling.
