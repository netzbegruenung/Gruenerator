# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ⚠️ Breaking Changes
- Database migrated from Supabase to local PostgreSQL
- Domain configuration centralized in `domainUtils.js`

### ✨ Added

**Chat & UI**
- ChatGPT-like start page layout with centered input experience
- Mobile chat experience with full text messages in edit mode
- Edit mode pencil on mobile with simplified MDX editor
- Sharepic sharing modal with file sharing and clipboard utilities

**Video & Media**
- Video editor with auto-processing and Remotion integration
- New subtitler editor with project management
- Two download buttons for subtitler (Instagram/Full quality)
- FFmpeg process pool for concurrent video processing
- Enhanced sharing for SharedVideoPage (QR code, native Instagram share)
- Background video rendering for share links
- Floating play/pause button for mobile subtitle editor

**Features**
- Multi-domain support for .de, .at, .eu domains
- OParl API integration and Website generator
- Gladia transcription service
- Interactive antrag enabled by default
- Mistral reasoning mode for Pro Mode
- Auto-save exports as projects
- Christmas campaign popup and /weihnachten route

**Developer Experience**
- Reusable drag-drop hook (`useDragDropFiles`) with overlay styles
- Autocomplete and platform detection hooks
- Qdrant collections schema configuration
- Inline ghost text tag autocomplete for template modals

### ♻️ Changed
- ContentSelector simplified to popup-based selection
- FeatureIcons simplified with ValidationBanner removed
- BaseForm components updated with simplified layout styles
- Chat displays results as inline messages with extracted shared components
- Form includes start mode, example prompts, and input tips
- QA feature renamed to Notebook
- Profile settings UI simplified and merged
- Sharepic generation switched from Mistral to GPT-OSS (LiteLLM)
- Privacy mode always uses LiteLLM (gpt-oss) provider
- Sharepic text generation migrated from AWS Bedrock to Mistral
- Alttext migration to Mistral Large 3 vision
- Centralized subtitler API calls with auth guards
- Reel-Grünerator renamed to Grünerator Reel-Studio
- Replaced fluent-ffmpeg with custom wrapper
- Console.log converted to Winston logger in routes/
- Default subtitle height changed from standard to tief

### 🐛 Fixed

**Authentication & Backend**
- Auth: Graceful fallback for database errors during login
- AI: Fallback chain reordered to prioritize Mistral after LiteLLM
- AI worker: Fallback for empty AI responses
- Backend: Privacy mode check removed from enableDocQnA
- ES module imports in route files

**Mobile & UI**
- Mobile start page layout, hidden edit button, improved touch targets
- Mobile styling for ActionButtons, MDXEditor toolbar, and forms
- Mobile popups full height like Instagram stories
- Login modal layout and mobile padding

**Subtitler**
- CSS naming conflicts, pixelated subtitles, race condition
- Subtitle font sizes for HD+ resolutions
- Subtitle line breaking (balanced 50/50 split, max 4 words)
- Subtitle vertical centering with \an5\pos
- Video bitrate matching input file size
- Font family names in ASS subtitle generation

**General**
- Edit mode z-index stacking and platform selector overlap
- Form validation mode changed to onSubmit
- Store reads latest value in getEditableText
- Chat uses proper assistant avatar
- Restored chatMemoryService.js accidentally deleted in refactor
- Dark mode gradient title now white
- CSP: Added Matomo and Canva domains
- Spinner sizing for primary buttons
- CSS secondary color variable mapping
- Auth redirect loop in Reel Studio for unauthenticated users
- Auto-reload on chunk load failures after deployment
- URL sanitization for unbalanced trailing punctuation

### ⚡ Performance
- Subtitler style optimizations
- Form layout optimizations
- FFmpeg encoding with VAAPI hardware acceleration
- Video streaming URL instead of blob download
- Deferred video loading for faster project selection
- Subtitle export with faster preset and ASS caching

### 🗑️ Removed
- E-Learning feature
- You feature
- Bundestag feature
- Chat memory service (old implementation)
- Word highlight subtitle feature
- Wolke upload option (temporarily hidden)

---

## [2.5.0] - 2025-12-03

### ✨ Added
- Chat persistence for QA pages with conversation history
- ChatGPT-style start page with suggestion chips
- Matomo analytics integration for usage tracking
- Default enabled support for beta features
- Notebooks feature enabled for all users

### ♻️ Changed
- Theme toggle moved from Header to Footer
- GrueneratorChatStartPage merged into ChatStartPage with variant prop
- Voice recording and file upload logic consolidated in chat
- h4 font size reduced for better heading hierarchy

### 🐛 Fixed
- Dark mode background-color-alt alignment with prefers-color-scheme
- Citation number white color preserved in fullscreen chat
- Citation display with smaller text and badge styling
- ChatStartPage input sizing and mobile spacing
- Removed "Mein Konto" from mobile menu
- Theme-aware font color in header and homepage
- Spinner visibility on green SubmitButton
- Dropdown text color using font-color variable
- Social prompt constrained to generate only requested content

### ⚡ Performance
- Optimized QA graph and embedding cache
- Optimized AI generation latency with parallel processing

### 🗑️ Removed
- AI shortener service from sharepic generation
- Brackets from citation numbers

---

## [2.4.0] - 2025-11-25

### ✨ Added
- FLUX.2 Pro API migration with JSON structured prompts
- Custom Grueneratoren system (Open Beta)
- Modular campaign system with JSON-driven configs
- Austria (Grüne Österreich) locale-based styling for subtitler
- Canva template button with text copy to ImageDisplay
- "Weitere Quellen" section in QA with improved crawler
- Step-based NotebookCreator replacing QACreator
- User profile avatar in edit mode chat assistant messages
- Arrow icon to info_canvas and zitat_pure_canvas
- Dynamic vertical centering and font scaling for short quotes
- Text2sharepic service for sharepic generation
- Generation statistics tracking
- Login requirement for QA, notebook, SearchPage, and KampagnenGenerator

### ♻️ Changed
- GrueneType font replaced with GrueneTypeNeue
- Daily image generation limit increased from 5 to 10
- Browser tab title updated to "Grünerator - Grüne KI"
- QAChat component simplified with improved citation handling
- SmartInput auto-populates with most recent value on mount
- Profile route changed from /generatoren to /grueneratoren
- Popup system simplified with auth protection

### 🐛 Fixed
- Custom generator form field deletion not updating UI
- Chat input contrast in dark mode
- KI-Sharepic hidden in production settings
- FeatureIcons hidden in Imagine and Accessibility generators
- Arrow SVG resolution to fix pixelation in sharepics
- Zitat sharepic name and image attachment issues
- Zitat_pure JSON truncation and font size
- User's robot avatar shown in typing indicator

### 🔒 Security
- Removed hardcoded Qdrant credentials from codebase

---

## [2.3.0] - 2025-11-15

### ✨ Added
- Beta features system with defaultEnabled support
- Auto-save on export feature in Labor tab
- Configurable login provider system to LoginPage
- Component-aware default mode system for generators
- Igel mode beta feature
- Interactive Antrag with quiz-style interface and smart input
- Survey page for custom grueneratoren feedback
- Reusable IndexPage/IndexCard components

### ♻️ Changed
- Footer layout and styling redesigned
- ContentManagement tabs reordered with SettingsSection added
- Intelligence tab removed, Anweisungen section added
- Profile page and custom generators UI overhauled
- Tanne color system replaced with Phtalo Green
- Interactive Antrag expanded to 5 questions with AI-driven gap analysis

### 🐛 Fixed
- Unwanted fade-in animation when opening generators
- Zustand store subscriptions and missing import for file attachments
- Batch processing for Qdrant vector uploads to prevent payload size errors
- Redis-backed checkpointer for cross-worker LangGraph state persistence
- Interactive antrag flow stuck after questions
- Generator disappearing after save
- Edit mode in AntragGenerator and UniversalTextGenerator
- MinWidth constraint from balanced mode dropdown

### 🔒 Security
- Fixed critical path traversal vulnerabilities with centralized path sanitization

### ⚡ Performance
- FeatureIcons re-render performance optimized by 80-90%

### 🗑️ Removed
- Deprecated selectedKnowledgeIds from backend
- LoggedOutPage component

---

## [2.2.0] - 2025-11-01

### ✨ Added
- Interactive Antrag feature with LangChain integration
- Route usage analytics and text editing enhancements
- Automatic SearXNG to Mistral fallback for web search
- Modal login prompt for non-authenticated users in FeatureIcons
- Campaign type selector to KampagnenGenerator
- Generate 4 different poems in single AI call

### ♻️ Changed
- React Portal implementation for FeatureIcons dropdowns
- Interactive Antrag made beta feature with full gating
- Spacing behavior improved for feature-icons dropdown

### 🐛 Fixed
- ToolHandler support for both OpenAI and Claude tool formats
- Removed (optional) designation from Imagine form input fields
- Aligned Bürgeranfragen form fields with backend validation
- Missing platformSelector in UNIVERSAL tabIndex config
- Document loading state synchronization between stores
- KnowledgeSelector incorrect empty state during loading
- Qdrant validation error when scrolling with limit=0

### ⚡ Performance
- Default AI worker count increased from 6 to 7

---

## [2.1.0] - 2025-10-18

### ✨ Added
- Universal text generator with submit and loading states
- Missing prompt configuration files for text generators
- Pro Mode migration from Bedrock to Magistral

### ♻️ Changed
- All backend dependencies updated to latest stable versions
- LangChain packages updated to v1.0.x for compatibility
- Notebooks and Chat features temporarily hidden in LaborTab

### 🐛 Fixed
- Authentication blocking issue on first visit to production
- Custom generator form data transmission to backend
- Reel-Grünerator reference to AssemblyAI instead of OpenAI
- Content cut-off in chat workbench
- Universal route prompts to use markdown formatting

---

## [2.0.0] - 2025-02-26

### ✨ Added
- Subtitler feature for video subtitle generation
- Enhanced search functionality with navigation integration
- Improved export functionality
- New navigation and layout components
- 404 error page
- White text class for improved contrast

### ♻️ Changed
- Major menu structure improvements
- Header design modifications with mobile search enhancements
- Navigation menu simplified with extracted MenuItem component
- BaseForm component with extended platform container functions
- Footer structure updates with BTW-Kompass and Grüne Jugend features
- Wahlprüfstein BTW renamed to BTW Programm-Kompass

### 🐛 Fixed
- Toggle button functionality
- Mobile layout and button styles for sharepic
- Slogans for quote route
- Black quotation mark and header/footer route kompass
- Year references updated to 2025

---

## [1.1.0] - 2025-01-13

### ✨ Added
- Quote generator (Sharepic) feature
- Grüne Jugend generator with dedicated routes
- BTW-Kompass with help text improvements
- Slogan selection component for sharepics
- New template preview images and templates
- White text color for help-text class

### ♻️ Changed
- Feature-based file organization structure
- Verify feature improved with cleanup
- Advanced editing section layout improvements
- Social Media Generator enhancements
- Platform-based content management
- CSS improvements across sharepic generator

### 🐛 Fixed
- Allow generation with open slogan selection
- Sunflower position optimization for 2-bar layout
- Contributor name correction (Stefan Ossenberg)
- Multi-platform export in social media generator
- Punycode encoding for URLs with umlauts in CSP/CORS
- Hover effect for upload button consistency

---

## [1.0.0] - 2024-12-24

### ✨ Added
- Initial release of Grünerator
- AI-powered text generation with Claude AI
- Progressive Web App (PWA) functionality
- Responsive frontend design with React and Vite
- Backend API with Express and worker pool architecture
- Keycloak OIDC authentication system
- Sharepic generator foundation
- Real-time collaboration with Y.js
- Multi-provider AI support (Claude, OpenAI, Mistral)
- Supabase database integration
- Dark/light mode theming

### 🔒 Security
- Secure API endpoints implementation
- Privacy-compliant processing without cookie usage
- Upload limit increased to 32MB with domain umlaut support

---

[Unreleased]: https://github.com/netzbegruenung/Gruenerator/compare/v2.5.0...HEAD
[2.5.0]: https://github.com/netzbegruenung/Gruenerator/compare/v2.4.0...v2.5.0
[2.4.0]: https://github.com/netzbegruenung/Gruenerator/compare/v2.3.0...v2.4.0
[2.3.0]: https://github.com/netzbegruenung/Gruenerator/compare/v2.2.0...v2.3.0
[2.2.0]: https://github.com/netzbegruenung/Gruenerator/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/netzbegruenung/Gruenerator/compare/v2.0.0...v2.1.0
[2.0.0]: https://github.com/netzbegruenung/Gruenerator/compare/v1.1.0...v2.0.0
[1.1.0]: https://github.com/netzbegruenung/Gruenerator/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/netzbegruenung/Gruenerator/releases/tag/v1.0.0
