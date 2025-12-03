# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.5.0] - 2025-12-03

### Added
- Chat persistence for QA pages with conversation history
- ChatGPT-style start page with suggestion chips
- Matomo analytics integration for usage tracking
- Default enabled support for beta features
- Notebooks feature enabled for all users

### Changed
- Move theme toggle from Header to Footer for better UX
- Merge GrueneratorChatStartPage into ChatStartPage with variant prop
- Consolidate voice recording and file upload logic in chat
- Reduce h4 font size for better heading hierarchy

### Fixed
- Dark mode background-color-alt alignment with prefers-color-scheme
- Citation number white color preserved in fullscreen chat
- Citation display with smaller text and badge styling
- ChatStartPage input sizing and mobile spacing
- Remove "Mein Konto" from mobile menu
- Theme-aware font color in header and homepage
- Spinner visibility on green SubmitButton
- Dropdown text color using font-color variable
- Social prompt constrained to generate only requested content

### Performance
- Optimize QA graph and embedding cache
- Optimize AI generation latency with parallel processing

### Removed
- AI shortener service from sharepic generation
- Brackets from citation numbers

## [2.4.0] - 2025-11-25

### Added
- FLUX.2 Pro API migration with JSON structured prompts
- Custom Grueneratoren system (Open Beta)
- Modular campaign system with JSON-driven configs
- Austria (Grune Osterreich) locale-based styling for subtitler
- Canva template button with text copy to ImageDisplay
- "Weitere Quellen" section in QA with improved crawler
- Step-based NotebookCreator replacing QACreator
- User profile avatar in edit mode chat assistant messages
- Arrow icon to info_canvas and zitat_pure_canvas
- Dynamic vertical centering and font scaling for short quotes
- Text2sharepic service for sharepic generation
- Generation statistics tracking
- Login requirement for QA, notebook, SearchPage, and KampagnenGenerator

### Changed
- Replace GrueneType font with GrueneTypeNeue
- Increase daily image generation limit from 5 to 10
- Update browser tab title to "Grunerator - Grune KI"
- Simplify QAChat component and improve citation handling
- Auto-populate SmartInput with most recent value on mount
- Profile route changed from /generatoren to /grueneratoren
- Popup system simplified with auth protection

### Fixed
- Custom generator form field deletion not updating UI
- Chat input contrast in dark mode
- KI-Sharepic hidden in production settings
- FeatureIcons hidden in Imagine and Accessibility generators
- Arrow SVG resolution to fix pixelation in sharepics
- Zitat sharepic name and image attachment issues
- Zitat_pure JSON truncation and font size
- User's robot avatar shown in typing indicator

### Security
- Remove hardcoded Qdrant credentials from codebase

## [2.3.0] - 2025-11-15

### Added
- Beta features system with defaultEnabled support
- Auto-save on export feature in Labor tab
- Configurable login provider system to LoginPage
- Component-aware default mode system for generators
- Igel mode beta feature
- Interactive Antrag with quiz-style interface and smart input
- Survey page for custom grueneratoren feedback
- Reusable IndexPage/IndexCard components

### Changed
- Redesign footer layout and styling
- Reorder ContentManagement tabs and add SettingsSection
- Remove Intelligence tab and add Anweisungen section
- Overhaul profile page and custom generators UI
- Replace Tanne color system with Phtalo Green
- Expand interactive Antrag to 5 questions with AI-driven gap analysis

### Fixed
- Unwanted fade-in animation when opening generators
- Zustand store subscriptions and missing import for file attachments
- Batch processing for Qdrant vector uploads to prevent payload size errors
- Redis-backed checkpointer for cross-worker LangGraph state persistence
- Interactive antrag flow stuck after questions
- Generator disappearing after save
- Edit mode in AntragGenerator and UniversalTextGenerator
- MinWidth constraint from balanced mode dropdown

### Security
- Fix critical path traversal vulnerabilities with centralized path sanitization

### Performance
- Optimize FeatureIcons re-render performance by 80-90%

### Removed
- Deprecated selectedKnowledgeIds from backend
- LoggedOutPage component

## [2.2.0] - 2025-11-01

### Added
- Interactive Antrag feature with LangChain integration
- Route usage analytics and text editing enhancements
- Automatic SearXNG to Mistral fallback for web search
- Modal login prompt for non-authenticated users in FeatureIcons
- Campaign type selector to KampagnenGenerator
- Generate 4 different poems in single AI call

### Changed
- React Portal implementation for FeatureIcons dropdowns
- Make interactive Antrag a beta feature with full gating
- Improve spacing behavior for feature-icons dropdown

### Fixed
- ToolHandler support for both OpenAI and Claude tool formats
- Remove (optional) designation from Imagine form input fields
- Align Burgeranfragen form fields with backend validation
- Missing platformSelector in UNIVERSAL tabIndex config
- Document loading state synchronization between stores
- KnowledgeSelector incorrect empty state during loading
- Qdrant validation error when scrolling with limit=0

### Performance
- Increase default AI worker count from 6 to 7

## [2.1.0] - 2025-10-18

### Added
- Universal text generator with submit and loading states
- Missing prompt configuration files for text generators
- Pro Mode migration from Bedrock to Magistral

### Changed
- Update all backend dependencies to latest stable versions
- Update LangChain packages to v1.0.x for compatibility
- Temporarily hide Notebooks and Chat features in LaborTab

### Fixed
- Authentication blocking issue on first visit to production
- Custom generator form data transmission to backend
- Reel-Grunerator reference to AssemblyAI instead of OpenAI
- Content cut-off in chat workbench
- Universal route prompts to use markdown formatting

## [2.0.0] - 2025-02-26

### Added
- Subtitler feature for video subtitle generation
- Enhanced search functionality with navigation integration
- Improved export functionality
- New navigation and layout components
- 404 error page
- White text class for improved contrast

### Changed
- Major menu structure improvements
- Header design modifications with mobile search enhancements
- Navigation menu simplified with extracted MenuItem component
- BaseForm component with extended platform container functions
- Footer structure updates with BTW-Kompass and Grune Jugend features
- Rename Wahlprufstein BTW to BTW Programm-Kompass

### Fixed
- Toggle button functionality
- Mobile layout and button styles for sharepic
- Slogans for quote route
- Black quotation mark and header/footer route kompass
- Year references updated to 2025

## [1.1.0] - 2025-01-13

### Added
- Quote generator (Sharepic) feature
- Grune Jugend generator with dedicated routes
- BTW-Kompass with help text improvements
- Slogan selection component for sharepics
- New template preview images and templates
- White text color for help-text class

### Changed
- Feature-based file organization structure
- Improved verify feature with cleanup
- Advanced editing section layout improvements
- Social Media Generator enhancements
- Platform-based content management
- CSS improvements across sharepic generator

### Fixed
- Allow generation with open slogan selection
- Sunflower position optimization for 2-bar layout
- Contributor name correction (Stefan Ossenberg)
- Multi-platform export in social media generator
- Punycode encoding for URLs with umlauts in CSP/CORS
- Hover effect for upload button consistency

## [1.0.0] - 2024-12-24

### Added
- Initial release of Grunerator
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

### Security
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
