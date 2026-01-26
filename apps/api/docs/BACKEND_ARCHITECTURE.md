# Grünerator Backend Architecture Documentation

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication System](#authentication-system)
   - [Keycloak OIDC Integration](#keycloak-oidc-integration)
   - [Multi-Source Identity Providers](#multi-source-identity-providers)
   - [Authentication Flow](#authentication-flow)
   - [Session Management](#session-management)
   - [Mobile Authentication (JWT)](#mobile-authentication-jwt)
3. [Database Architecture](#database-architecture)
   - [PostgreSQL Service Layer](#postgresql-service-layer)
   - [Connection Management](#connection-management)
   - [Data Models](#data-models)
   - [Query Patterns](#query-patterns)
4. [User Management](#user-management)
   - [User Lifecycle](#user-lifecycle)
   - [Profile Synchronization](#profile-synchronization)
   - [User Data Handling](#user-data-handling)
5. [Code Reference](#code-reference)
6. [Developer Workflows](#developer-workflows)
7. [Security Considerations](#security-considerations)
8. [Common Issues & Troubleshooting](#common-issues--troubleshooting)

---

## Architecture Overview

The Grünerator backend follows a sophisticated multi-tier architecture designed for scalability, security, and high availability:

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│         (Web App, Mobile App, API Consumers)                 │
└───────────────────┬─────────────────────────────────────────┘
                    │
┌───────────────────▼─────────────────────────────────────────┐
│                    Express.js Cluster                        │
│         (Multiple Worker Processes via cluster.fork)         │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Worker 1 │  │ Worker 2 │  │ Worker 3 │  │ Worker N │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└───────────────────┬─────────────────────────────────────────┘
                    │
        ┌───────────┴────────────┬────────────────┐
        │                        │                │
┌───────▼────────┐  ┌────────────▼──────┐  ┌────▼──────────┐
│   Keycloak     │  │    PostgreSQL     │  │     Redis     │
│  Auth Server   │  │    Database       │  │  Session Store│
│                │  │                   │  │               │
│ - OIDC/OAuth2  │  │ - User Profiles   │  │ - Sessions    │
│ - SAML Bridge  │  │ - Content Data    │  │ - Cache       │
│ - User Mgmt    │  │ - App Metadata    │  │ - Rate Limit  │
└────────────────┘  └───────────────────┘  └───────────────┘
```

### Key Design Decisions

1. **Cluster-Based Architecture**: Uses Node.js cluster module to spawn multiple worker processes (`server.mjs:45-108`), enabling vertical scaling across CPU cores. The number of workers is configurable via the `WORKER_COUNT` environment variable (defaults to 2).

2. **Separation of Concerns**: Authentication (Keycloak), Data (PostgreSQL), and Sessions (Redis) are completely decoupled services.

3. **Worker Pool for AI Operations**: Dedicated worker threads (`workers/aiWorkerPool.js`) handle AI API calls to prevent blocking the main event loop. The pool size is configurable via `AI_WORKER_COUNT` (defaults to 6 workers).

4. **Profile-First User Model**: All user operations go through the ProfileService (`services/ProfileService.mjs`), which is the single source of truth for user data.

5. **Graceful Shutdown**: Coordinated master-worker shutdown with 10-second timeout for each worker, ensuring all AI operations and database connections are properly closed.

6. **HTTP/2 Support**: Server supports HTTP/2 with fallback to HTTP/1.1, configured with keep-alive timeouts (60s) and optimized header handling.

---

## Core Backend Systems

### AI Worker Pool Architecture

The AI worker pool provides non-blocking AI API calls through dedicated worker threads (`workers/aiWorkerPool.js:6-203`). The AIWorkerPool class manages multiple worker threads using Node.js worker_threads module, implementing round-robin load balancing across workers. Each worker (`workers/aiWorker.js:1-163`) processes AI requests independently with request/response message protocol including progress updates. Workers communicate via structured messages with types (request, response, error, progress) and unique request IDs for tracking. The pool implements automatic worker replacement on failure - when a worker crashes, all pending requests are rejected and a new worker is spawned immediately. Configuration is centralized in `workers/worker.config.js:1-66` with settings for request timeout (120 seconds default), retry logic with exponential backoff, rate limiting per worker, and logging levels.

**Provider Selection System**: The system supports six AI providers through a unified adapter pattern (`workers/providers/index.js:1-19`). Available providers include Bedrock (AWS), Claude (Anthropic direct), OpenAI, Mistral, LiteLLM, and IONOS. Provider selection logic (`services/providerSelector.js:1-83`) determines the appropriate provider based on request type, user preferences, and privacy mode. The selectProviderAndModel function evaluates explicit provider requests, privacy mode requirements, type-specific defaults (qa_tools uses Mistral, gruenerator_ask uses Bedrock Haiku), and MAIN_LLM_OVERRIDE environment variable for global model selection. Privacy mode provider selection integrates with Redis-based PrivacyCounter to distribute requests across privacy-friendly providers. Each provider adapter implements a consistent execute method that accepts request ID and data, handles provider-specific API formatting, manages authentication and rate limiting, and returns standardized response format. Provider fallback (`services/providerFallback.js`) implements automatic retry across privacy-friendly providers when primary provider fails.

### Vector Database System (Qdrant)

The QdrantService (`database/services/QdrantService.js:14-1576`) provides vector search capabilities with ten specialized collections using a three-layer architecture: QdrantService for connection and collection management, QdrantOperations (`database/services/QdrantOperations.js`) for reusable search operations with filter validation, and domain services (DocumentSearchService, QAQdrantHelper) for user-scoped access enforcement. Collections include documents (user-uploaded document chunks with 1024-dim vectors), grundsatz_documents (political party program documents), user_knowledge (personal knowledge base entries), content_examples (template content for generation), social_media_examples (Facebook and Instagram examples with multitenancy), user_texts (saved library texts with user-scoped filtering), and four QA-related collections (qa_collections for metadata, qa_collection_documents for document associations, qa_usage_logs for analytics, qa_public_access for public sharing). Connection management supports HTTPS with host/port approach to work around Qdrant client URL parsing limitations, HTTP agent configuration with keep-alive and connection pooling, basic authentication support, and automatic retry mechanism with exponential backoff on connection failures. Health checking uses 30-second intervals with automatic reconnection attempts.

**Vector Operations**: The service provides comprehensive vector operations including indexing with FastEmbedService for 1024-dimensional embeddings, hybrid search combining vector similarity and keyword matching via Reciprocal Rank Fusion, multitenancy optimization using is_tenant flag for platform-based filtering in social media collections, and HNSW index configuration for fast approximate nearest neighbor search. Collections are optimized with segment sizing (2 segments for most collections, larger max_segment_size for high-volume collections), payload indexing on frequently filtered fields (user_id, platform, document_type), and text search indexes with word tokenizer for full-text matching on chunk_text fields. The service implements graceful degradation - if Qdrant is unavailable, the application continues running with vector search disabled.

**Security and Access Control**: The qa_public_access collection stores public access tokens for anonymous Q&A access with cryptographically random 64-character hex tokens (crypto.randomBytes(32)), expiry timestamps, view counters, and revocation support. Token validation checks expiry and is_active flag before granting access. The social_media_examples collection implements multitenancy via platform field (facebook/instagram) with is_tenant optimization for storage efficiency. User_texts collection enforces user-scoped filtering with mandatory user_id tenant index. All user data collections enforce user_id filtering at the query level (`QdrantOperations.js:575-601`, `DocumentSearchService.js:652-676`). System collections (grundsatz_documents) bypass user_id filtering but remain read-only. DocumentSearchService validates searchCollection parameter and enforces user_id filter for documents collection.

**Query Safety**: Filter construction uses structured objects rather than string concatenation to prevent injection attacks (`QdrantService.js:652-694`). All filter keys are validated against collection schema. User-supplied documentIds use parameterized any[] matching. Text search uses Qdrant's native text match mechanism rather than SQL LIKE patterns. Access control patterns include: mandatory user_id filter in must[] clause for user documents, collection ownership verification before Q&A document access, token validation via qa_public_access lookup for public Q&A with ephemeral tokens and expiry, and platform-scoped access for social media examples isolation.

**Degradation Security**: When Qdrant is unavailable, vector search is disabled but the application continues (`QdrantService.js:954-986`). This prevents DoS attacks via Qdrant service disruption. ContentExamplesService returns mock data fallbacks containing only non-sensitive placeholder content. DocumentSearchService returns empty results with clear error messages without exposing stack traces. FastEmbedService integration uses Mistral Embed API for 1024-dimensional embeddings with embedding caching layer via embeddingCache and mock embeddings for testing environments.

### Redis Infrastructure

Redis serves as the backbone for distributed state management across all worker processes. The Redis client (`utils/redisClient.js:1-45`) implements connection management with automatic TLS detection based on rediss:// protocol, exponential backoff reconnection strategy (max 5 retries, 100ms to 2000ms delays), connection health monitoring with event listeners for connect/error/reconnecting states, and graceful error handling that allows application to continue even if Redis is temporarily unavailable.

**Redis-Based Services**: SharepicImageManager (`services/sharepicImageManager.js:11-173`) provides temporary image storage for sharepic generation with 2-minute TTL, consume-once pattern where images are deleted immediately after retrieval to prevent reuse, session tracking for monitoring active image uploads, and automatic cleanup of expired sessions. Chat Memory Service (`services/chatMemoryService.js:1-293`) manages conversation history with 24-hour TTL for automatic expiry, trimming to last 20 messages for context management, pending request tracking for multi-turn conversations with 30-minute validity timeout, and per-user conversation isolation with user ID-based keys. Additional Redis services include OAuth state manager for OIDC flow state storage, embedding cache for frequently used vector embeddings, LRU cache implementation for search query enhancements, and rate limit counter storage for distributed rate limiting.

### Rate Limiting System

Universal rate limiting is implemented through a three-tier system (`middleware/rateLimitMiddleware.js:1-197`, `config/rateLimits.js:1-69`). User tiers include anonymous users (session ID or IP-based identification with strict limits), authenticated users (unlimited text generation, 5 images per day), and premium tier (higher limits for future implementation). Resource types are independently limited: image generation (0/day anonymous, 5/day authenticated, 50/day premium), text generation (5/day anonymous, unlimited authenticated), and PDF exports (2/day anonymous, 20/day authenticated, 100/day premium). The middleware provides both hard limits (block with 429 status) and soft limits (warn but allow with header flag), auto-increment mode for automatic counter updates on successful responses, and fail-open strategy that allows requests when Redis is unavailable to prevent outages.

**Rate Limit Implementation**: The RateLimiter class (`utils/RateLimiter.js`) manages Redis-based counters with daily, hourly, and monthly time windows that reset at midnight, top of hour, and first of month respectively. User identification uses multiple strategies in priority order: authenticated user ID from req.user, session ID from express-session, and IP address from req.ip or X-Forwarded-For header. Each resource type has dedicated Redis keys in format rate_limit:{resource}:{window}:{identifier}. The middleware attaches rate limit context to requests for manual increment calls and provides rateLimitInfo middleware for displaying remaining count in UI without blocking requests.

### API Routes Architecture

The central route registration (`routes.js:1-384`) implements dynamic ES6 module imports for modern module compatibility and organizes routes into functional categories. Authentication routes (`/api/auth/*`) include core auth flows (login, callback, logout, status), user profile management, user content and templates, group memberships, custom generators, mobile authentication endpoints, and QA collection management. Text generation routes (`/api/claude_*`) support social media post generation, alt text generation, easy language conversion, chat-based generation, universal text generation, Grünerator Ask (knowledge base query), and specialized generators for political contexts. Sharepic generation routes (`/api/*_canvas`, `/api/*_claude`) include five canvas-based generators (dreizeilen, zitat, headline, info, imagine_label), AI-powered text suggestion for sharepics, unified generation endpoint combining text and image, and Abyssale integration for professional templates.

**Additional Route Categories**: Search and analysis routes (`/api/search/*`) provide unified search controller with LangGraph-based autonomous search, deep research mode for comprehensive topic analysis, and search analysis endpoints. Document management routes (`/api/documents/*`) handle document upload and processing, QA collection creation and management, and QA interaction endpoints for question answering. Subtitler routes (`/api/subtitler/*`) support video upload with TUS resumable protocol, transcription via AssemblyAI, multiple subtitle format generation, and social media subtitle optimization. External integration routes include Canva API for design automation, Nextcloud for file sharing, Abyssale for professional graphic templates, and Bundestag API for political data. Internal routes (`/api/internal/*`) provide offboarding automation and optional snapshotting triggers for Y.js document backups.

### Key Service Layer Components

**Document Services**: DocumentProcessingService handles PDF parsing with text extraction, document chunking with optimal chunk sizes, structure detection for headings and sections, and metadata extraction. DocumentQnAService implements question-answering over document collections using vector search for relevant chunks, LangGraph agents for answer generation, and citation tracking for source attribution. UserKnowledgeService manages personal knowledge bases with per-user vector storage and privacy-scoped search. ContentExamplesService provides template management for text generation with category-based filtering and semantic search for relevant examples.

**Image Services**: ImagePickerService implements AI-powered image selection using vision models to analyze image content, matching images to text context, and ranking by relevance. FluxImageService handles AI image generation via Flux API with prompt engineering, style transfer options, and image optimization. OCRService provides text extraction from images using Tesseract for scanned documents and handwriting recognition. DefaultSharepicService generates standard sharepics combining text overlay, background image selection, and color scheme application.

**Search Services**: SearchCore implements the main search logic coordinating between vector search, keyword search, and result ranking. QueryIntentService classifies search intent using AI to determine whether user wants examples, knowledge base search, or web search results. KeywordExtractor identifies important terms from queries for enhanced search. MistralWebSearchService and SearxngWebSearchService provide web search capabilities with privacy-focused search engines and result parsing.

**External API Clients**: CanvaApiClient manages OAuth flows, design creation and modification, and template management with token refresh handling via CanvaTokenManager. BundestagApiClient provides parliamentary data access including member information, voting records, and legislative documents with caching via BundestagUtils. NextcloudApiClient handles file operations and public share link generation through NextcloudShareManager. AbyssaleApiClient creates professional graphics from templates with parameter mapping and local file caching. KeycloakApiClient manages user CRUD operations, password resets, and admin operations via Keycloak Admin API.

**Subtitler Services**: TranscriptionService coordinates video processing via AssemblyAI integration through AssemblyAIService. TUSService implements resumable uploads for large video files via TUS protocol with chunk-based upload and resume support. VideoUploadService handles standard video uploads with format validation and size limits. Multiple subtitle generators include ManualSubtitleGeneratorService for standard subtitle formats, ShortSubtitleGeneratorService for condensed captions, WordHighlightSubtitleService for karaoke-style highlighting, and AssSubtitleService for Advanced SubStation Alpha format. BackgroundCompressionService optimizes videos for web delivery with FFmpeg integration.

### Utility Layer

**Core Utilities**: PromptUtils and PromptBuilderCompat manage AI prompt construction with template loading, variable interpolation, and context building. TokenCounter provides accurate token counting for different AI models to stay within limits. TextChunker implements smart document chunking with paragraph-aware splitting, overlap for context preservation, and size optimization. MarkdownService converts between markdown and other formats including HTML rendering and plain text extraction. HashUtils provides consistent hashing for IDs and cache keys.

**Validation and Security**: InputValidation implements comprehensive input sanitization with SQL injection prevention, XSS protection, type checking and constraints, and custom validation rules. SecurityUtils provides additional security helpers including CSRF token generation, sensitive data masking in logs, and secure random string generation. URLDetection identifies and validates URLs in text content.

**Content Processing**: TextCleaning normalizes text for consistent processing with whitespace normalization, special character handling, and format standardization. ContentTypeDetector identifies content types from files and text for proper routing. AttachmentUtils and AttachmentToCanvasAdapter handle file attachments in API requests with base64 encoding/decoding and format conversion.

**Performance Utilities**: BatchProcessor enables efficient bulk operations with configurable batch sizes, progress tracking, and error handling. PrivacyCounter and ImageGenerationCounter track usage for rate limiting and analytics with Redis-backed counters and automatic reset on window expiry. LocalizationHelper manages multi-language support with German and Austrian German variants.

---

## Middleware Stack and Security

### Request Processing Pipeline

Each worker process implements a carefully ordered middleware stack (`server.mjs:207-465`):

#### 1. CORS Configuration (`server.mjs:116-207`)

The CORS middleware implements environment-based origin whitelisting:

- **Production Origins**: Includes all production domains (gruenerator.de, beta subdomain, Punycode variants for grünerator.de, netzbegruenung domains)
- **Development Origins**: Adds localhost and 127.0.0.1 on ports 3000/3001 when `NODE_ENV !== 'production'`
- **Proxy Support**: Reconstructs origin from `X-Forwarded-Host` and `X-Forwarded-Proto` headers when nginx strips the Origin header
- **Strict Validation**: Blocks any origin not in the whitelist with explicit logging
- **Credentials**: Enabled (`credentials: true`) for cookie-based authentication
- **TUS Protocol**: Includes resumable upload headers (Upload-Length, Upload-Offset, Tus-Resumable, Upload-Metadata)

#### 2. Request Size Limits (`server.mjs:209-214`)

Security measure to prevent DoS attacks:

- **JSON/Raw**: 10MB limit for API requests
- **Videos**: 150MB limit via Multer (MP4, MOV, AVI formats)
- **General Files**: 75MB limit for other uploads
- **413 Response**: Custom error message for oversized files

#### 3. Compression (`server.mjs:266-274`)

Gzip compression with level 6 (balance between speed and ratio):

- **Conditional**: Respects `x-no-compression` header
- **Selective**: Applied after session middleware to avoid compressing sensitive data unnecessarily

#### 4. Helmet Security Headers (`server.mjs:276-312`)

Content Security Policy (CSP) configuration:

- **Script Sources**: Allows self, unsafe-inline, unsafe-eval, and data URIs (required for dynamic AI-generated content)
- **Style Sources**: Self and unsafe-inline (required for CSS-in-JS)
- **Image Sources**: Self, data URIs, blob URIs, and Unsplash CDN
- **Connect Sources**: Comprehensive whitelist including:
  - All gruenerator.de subdomains and Punycode variants
  - WebSocket endpoints for Y.js collaborative editing (ws://localhost:_, ws://127.0.0.1:_)
  - Netzbegrünung domains
  - Local development URLs
- **Cross-Origin Policies**:
  - Resource Policy: "cross-origin" (allows cross-origin resource embedding)
  - Opener Policy: "same-origin-allow-popups" (supports OAuth popups)

#### 5. Session Middleware (`server.mjs:421-435`)

See Session Management section for details.

#### 6. Passport Authentication (`server.mjs:439-442`)

Passport is initialized globally but session handling is only applied to auth routes to optimize performance.

#### 7. Request Logging (`server.mjs:454-459`)

Morgan logging with smart filtering:

- **Skipped**: POST requests to /api/ routes and successful responses (status < 400)
- **Logged**: Errors and non-API requests for debugging

#### 8. Cache Middleware (`server.mjs:378-404`)

Redis-based response caching (see Caching Strategy section).

### Service Initialization Sequence

Each worker initializes services in a specific order (`server.mjs:221-264`):

1. **AI Worker Pool** (`server.mjs:221-224`)
   - Configurable worker count via `AI_WORKER_COUNT` (default: 6)
   - Redis integration for privacy mode support
   - Attached to `app.locals.aiWorkerPool` for global access

2. **AI Search Agent** (`server.mjs:226-234`)
   - Optional service with graceful degradation
   - Uses the AI worker pool for search operations
   - Logs warning but continues if initialization fails

3. **SharepicImageManager** (`server.mjs:236-245`)
   - Redis-backed image management service
   - Handles sharepic background images
   - Per-worker instance with shared Redis state

4. **PostgreSQL Connection** (`server.mjs:247-255`)
   - Connection pool initialization only (no schema operations)
   - Automatic retry mechanism on failure (see Database Architecture)
   - Application continues even if database is unavailable

5. **ProfileService** (`server.mjs:257-264`)
   - User profile management layer
   - Depends on PostgreSQL being initialized
   - Graceful degradation with warning on failure

All services implement graceful degradation - if a service fails to initialize, the worker logs a warning but continues running to maintain availability.

### Timeout Configurations

Multiple timeout layers ensure reliability (`server.mjs:216-219, 609-614, 698-707`):

- **Response Timeout**: 15 minutes (900,000ms) for long-running AI operations
- **Large File Transfer Timeout**: 5 minutes (300,000ms) for video uploads
- **Server Timeout**: 5 seconds for initial connection
- **Keep-Alive Timeout**: 60 seconds HTTP keep-alive, 30 seconds socket keep-alive
- **Headers Timeout**: 65 seconds (must exceed keep-alive timeout)

---

## Authentication System

### Keycloak OIDC Integration

The authentication system is built on OpenID Connect (OIDC) using Keycloak as the identity provider. The implementation uses the `openid-client` library v6 for robust OIDC support.

#### Core Components

**1. OIDC Strategy Configuration** (`config/keycloakOIDCStrategy.mjs:14-48`)

The custom `KeycloakOIDCStrategy` class extends Passport's base Strategy. It stores the strategy name as 'oidc', maintains configuration options, and implements an async `initialize()` method that performs OIDC discovery using the Keycloak realm URL, client ID, and client secret from environment variables.

**2. Passport Setup** (`config/passportSetup.mjs:10-17`)

This file initializes the Keycloak OIDC strategy and registers it with Passport. It implements user serialization by storing the full user object in the session, and deserialization by fetching the user from the database while preserving critical session data that may have been updated during the session.

### Multi-Source Identity Providers

The system supports three distinct authentication sources, all federated through Keycloak:

#### 1. Grünerator Login (Direct Keycloak)

- **Type**: Native Keycloak realm users
- **Hint**: `kc_idp_hint=gruenerator-user`
- **Usage**: Primary authentication for users who register directly
- **Route**: `/auth/login?source=gruenerator-login`

#### 2. Netzbegrünung SAML

- **Type**: External SAML Identity Provider
- **Hint**: `kc_idp_hint=netzbegruenung`
- **Usage**: Federation with Netzbegrünung network
- **Route**: `/auth/login?source=netzbegruenung-login`

#### 3. Grünes Netz SAML

- **Type**: External SAML Identity Provider
- **Hint**: `kc_idp_hint=gruenes-netz`
- **Usage**: Federation with Green Party network
- **Route**: `/auth/login?source=gruenes-netz-login`

#### 4. Grüne Österreich (Austria)

- **Type**: External SAML Identity Provider
- **Hint**: `kc_idp_hint=gruene-at-login`
- **Locale**: Automatically sets `de-AT` for Austrian users
- **Route**: `/auth/login?source=gruene-oesterreich-login`

### Authentication Flow

#### Step 1: Login Initiation (`routes/auth/authCore.mjs:108-175`)

The `/login` endpoint first runs a session health check, then extracts the authentication source and redirect URL from query parameters. It stores these values in the session, then configures OIDC authentication options including the required scopes (openid, profile, email, offline_access). Based on the source parameter, it adds the appropriate `kc_idp_hint` to route the user to the correct identity provider (Netzbegrünung, Grünes Netz, or Austrian Greens). Finally, it initiates Passport authentication with the configured options.

#### Step 2: Authorization Redirect (`config/keycloakOIDCStrategy.mjs:71-106`)

The OIDC strategy generates a random state value for CSRF protection and stores it in the session along with the redirect URL, a correlation ID for tracking, and a timestamp for timeout validation. It then builds the authorization URL with standard OIDC parameters (scope, state, redirect_uri, response_type='code') and adds any Keycloak-specific parameters like `kc_idp_hint`. The user is redirected to Keycloak's authorization endpoint.

#### Step 3: Callback Processing (`config/keycloakOIDCStrategy.mjs:147-248`)

When Keycloak redirects back to the callback endpoint, the strategy retrieves the session data and validates it. It checks that the session exists (preventing replay attacks) and hasn't expired (10 minute timeout). The authorization code is then exchanged for tokens using the authorization code grant flow, validating that the state parameter matches. User information is fetched from Keycloak's userinfo endpoint using the access token. The response is converted to Passport's profile format with standardized fields (id from sub claim, displayName, emails array, username). Finally, the profile is passed to the verify callback for user processing.

#### Step 4: User Profile Handling (`config/passportSetup.mjs:74-158`)

The `handleUserProfile` function extracts the Keycloak ID, email, and username from the profile. It determines the authentication source from the session (or defaults to 'gruenerator-login') and sets the locale accordingly ('de-AT' for Austrian users, 'de-DE' otherwise). The function first checks if a user exists with the given Keycloak ID - if found, it updates their profile with the latest information while preserving their existing email and locale. If no user exists with that Keycloak ID but an email is provided, it checks for account linking opportunities by searching for users with the same email. If a match is found, it links the accounts by adding the Keycloak ID. If no existing user is found by either method, it creates a new user profile with all the authentication information.

### Session Management

Sessions are managed using Redis for distributed storage across worker processes:

#### Session Configuration (`server.mjs:421-435`)

The session middleware is configured with RedisStore for distributed session storage. It uses an environment variable for the secret, disables resave (since Redis handles saves), and saves uninitialized sessions. The session cookie is named 'gruenerator.sid', with security settings that enable 'secure' flag in production, set httpOnly to prevent XSS, allow a 30-day max age, use sameSite='lax' for OAuth compatibility, and set path to root.

#### Session Health Monitoring (`routes/auth/authCore.mjs:70-105`)

The `checkSessionHealth` middleware function tests session storage before critical operations. It writes a test value to the session, saves it with a 3-second timeout, and verifies that the value can be read back correctly. If the session save fails or times out, it rejects with an error. This prevents authentication flows from proceeding when Redis is unavailable. The test key is cleaned up after verification.

### Mobile Authentication (JWT)

Mobile applications use JWT tokens for stateless authentication:

#### JWT Middleware (`middleware/jwtAuthMiddleware.js`)

The JWT authentication middleware checks for a Bearer token in the Authorization header. If absent, it falls through to session-based authentication. When a token is present, it first attempts to verify it as a simple mobile JWT using the jose library, validating the issuer ('gruenerator-mobile') and audience ('gruenerator-app'). On successful verification, it retrieves the user profile from the database using the subject claim (sub) and attaches user data to the request object along with flags indicating mobile authentication. If simple JWT verification fails, it falls back to Keycloak JWT validation.

#### Mobile Login Code Generation (`routes/auth/authCore.mjs:196-230`)

For mobile deep linking, the system generates very short-lived (60 second) login codes. It checks that the redirect URL is whitelisted for mobile apps, then creates a JWT containing the token type ('app_login_code'), user ID (sub), and Keycloak ID. The token is signed with HMAC-SHA256 using the session secret, includes a unique JTI (JWT ID) for one-time use, and specifies issuer and audience claims. The code is appended to the redirect URL as a query parameter.

---

## Database Architecture

### PostgreSQL Service Layer

The PostgreSQL service (`database/services/PostgresService.js`) provides a robust abstraction layer with connection pooling, query building, and schema validation.

#### Service Initialization (`database/services/PostgresService.js:84-121`)

The PostgresService constructor supports two configuration methods: using a single `DATABASE_URL` connection string, or discrete environment variables for host, port, user, password, and database. Both approaches configure the same connection pool settings: 20 max connections, 30-second idle timeout, and 10-second connection timeout. SSL is enabled based on the `POSTGRES_SSL` environment variable. The `init()` method sets the health status to 'connecting', creates a new Pool with the configuration, tests the connection, and marks the service as initialized and healthy.

### Connection Management

#### Connection Pool Configuration

The system uses `pg.Pool` with optimal settings for production:

- **Max Connections**: 20 per worker process
- **Idle Timeout**: 30 seconds
- **Connection Timeout**: 10 seconds
- **Health Monitoring**: Automatic retry on failure

#### Connection Health Monitoring (`database/services/PostgresService.js:253-263`)

The `testConnection` method acquires a client from the pool, executes a simple `SELECT NOW()` query to verify database connectivity, logs the result on success, and always releases the client back to the pool in the finally block. If the query fails, it throws an error with the failure message.

#### Automatic Retry Mechanism (`database/services/PostgresService.js:103-129`)

The initialization method includes error handling that catches connection failures. On error, it sets the service status flags to indicate failure (`isInitialized=false`, `isHealthy=false`, `healthStatus='error'`) and stores the error message. It then schedules an automatic retry after 5 seconds using `setTimeout`, allowing the application to continue running while attempting to reconnect to the database in the background.

### Data Models

#### Profiles Table (Primary User Model)

The `profiles` table is the central user entity (`database/postgres/schema.sql:8-64`). It includes:

- **Primary Key**: UUID with automatic generation
- **Identity fields**: keycloak_id (Keycloak subject identifier), username, email
- **Display information**: first_name, last_name, display_name, avatar_url, avatar_robot_id (default 1)
- **Authentication metadata**: auth_source (which identity provider), locale (de-DE or de-AT with CHECK constraint), last_login timestamp
- **Features and permissions**: beta_features JSONB for flexible feature flags, is_admin, memory_enabled, igel_modus, bundestag_api_enabled
- **Individual feature flag columns**: groups_enabled, custom_generators, database_access, and more for backward compatibility
- **Timestamps**: updated_at with automatic CURRENT_TIMESTAMP

#### Relationships and Foreign Keys

The database uses CASCADE deletion for maintaining referential integrity. The `documents` table references profiles with `user_id UUID REFERENCES profiles(id) ON DELETE CASCADE`, ensuring documents are automatically deleted when a user is deleted. The `group_memberships` table implements many-to-many relationships between groups and users, with CASCADE deletion on both sides and a UNIQUE constraint on (group_id, user_id) to prevent duplicate memberships. The role defaults to 'member'.

### Query Patterns

#### Safe Query Building with Validation (`database/services/PostgresService.js:678-700`)

The `insert` method implements secure query building by first validating the table name and column names against the schema whitelist. It extracts column names and values from the data object, creates parameterized placeholders ($1, $2, etc.) to prevent SQL injection, builds an INSERT query with RETURNING clause, and executes it with the values array. The method returns the first result row.

#### Schema Validation for SQL Injection Prevention (`database/services/PostgresService.js:159-197`)

Schema validation prevents SQL injection by maintaining a whitelist of valid tables and columns. The `validateTableName` method checks if a table exists in the schema cache (initializing it if needed), throwing an error if the table isn't found. The `validateColumnNames` method validates all column names against the valid columns for that specific table, throwing an error if any column name doesn't exist in the schema. This whitelist approach ensures only legitimate table and column names can be used in queries.

#### Transaction Support (`database/services/PostgresService.js:939-955`)

The `transaction` method provides atomic database operations. It ensures the database is initialized, acquires a client from the pool, begins a transaction with BEGIN, executes the callback function with the client, commits on success, or rolls back on error. The client is always released back to the pool in the finally block. Any errors are logged and re-thrown to the caller.

---

## Caching Strategy

The backend implements a multi-layer caching approach to optimize performance and reduce load on services.

### Redis Response Caching (`server.mjs:378-404`)

The `cacheMiddleware` implements automatic response caching for GET requests:

#### Cache Logic

- **Scope**: Only GET requests to non-API routes are cached
- **Key Format**: `cache:${originalUrl}` - URL-based cache keys
- **TTL**: 1 hour (3600 seconds) expiration time
- **Storage**: Redis for distributed caching across workers
- **Invalidation**: Automatic TTL-based expiration

#### Cache Flow

1. **Cache Check**: On GET request, middleware checks Redis for cached response
2. **Cache Hit**: If found, returns cached JSON response immediately
3. **Cache Miss**: If not found, intercepts the `res.send` method
4. **Cache Population**: After response is sent, stores the response body in Redis with 1-hour TTL
5. **API Exclusion**: Routes starting with `/api/` are explicitly excluded from caching

#### Error Handling

Cache errors are logged but don't prevent request processing - if Redis is unavailable, requests pass through normally without caching.

### Static File Caching (`server.mjs:538-556`)

Different caching strategies for different asset types:

#### Hashed Assets (`/assets/*`)

- **Max-Age**: 1 day
- **ETag**: Enabled for validation
- **Immutable**: True (files have content hash in filename, can be cached indefinitely)
- **Use Case**: JavaScript, CSS bundles from Vite build

#### General Static Files

- **Max-Age**: 1 day
- **ETag**: Enabled
- **Index**: Disabled (no directory listings)
- **Extensions**: Explicit whitelist (html, js, css, png, jpg, gif, svg, ico)

#### Video Uploads (`/uploads/exports/*`)

- **Cache-Control**: no-cache (always revalidate due to potentially sensitive content)
- **Accept-Ranges**: bytes (supports partial content/streaming)
- **Cross-Origin**: Allowed with wildcard CORS

#### Sharepic Backgrounds (`/public/*`)

- **Cache-Control**: public, max-age=86400 (24 hours)
- **Cross-Origin**: Allowed with wildcard CORS
- **Use Case**: Background images for sharepic generator

### Cache Optimization Strategies

1. **Immutable Assets**: Vite's content-hash filenames enable aggressive caching
2. **Worker Isolation**: Each worker has its own cache logic but shares Redis state
3. **Selective Caching**: API routes and dynamic content explicitly excluded
4. **Graceful Degradation**: Cache failures don't impact functionality

---

## File Upload Handling

The system supports various file upload scenarios with specialized configurations.

### Multer Configuration (`server.mjs:499-520`)

#### Video Uploads (`/subtitler/process`)

- **Size Limit**: 150MB maximum file size
- **Allowed Formats**: video/mp4, video/quicktime, video/x-msvideo (MP4, MOV, AVI)
- **Validation**: MIME type checking with rejection of invalid formats
- **Error Message**: Custom German-language error for invalid formats
- **Use Case**: Video files for subtitle generation

#### General File Uploads (`/upload`)

- **Size Limit**: 75MB maximum file size
- **No Format Restrictions**: Accepts all file types
- **Use Case**: General document and image uploads

### TUS Resumable Upload Protocol (`server.mjs:485-494`)

The system supports TUS protocol for resumable video uploads:

#### TUS Implementation

- **Endpoint**: `/api/subtitler/upload` (with wildcard for upload IDs)
- **Methods**: Handles all HTTP methods (POST, HEAD, PATCH, OPTIONS, DELETE)
- **Routing**: Direct delegation to tusServer.handle()
- **Use Case**: Large video files that may need resumption on network failure

#### TUS Headers

CORS configuration includes TUS-specific headers:

- **Upload-Length**: Total file size
- **Upload-Offset**: Current upload position
- **Tus-Resumable**: Protocol version
- **Upload-Metadata**: File metadata
- **Upload-Defer-Length**: For unknown size uploads
- **Upload-Concat**: For concatenated uploads

### Upload Error Handling (`server.mjs:526-536`)

Specialized error middleware for Multer errors:

- **MulterError LIMIT_FILE_SIZE**: Returns 413 status with German message "Datei ist zu groß. Videos dürfen maximal 150MB groß sein."
- **Other Multer Errors**: Passed to general error handler
- **Error Format**: Consistent JSON response structure

### Health Check Endpoint (`server.mjs:467-476`)

Simple endpoint for availability monitoring:

**Endpoint**: GET `/health`

**Response Format**:

- `status`: Always "healthy" if server is running
- `timestamp`: ISO 8601 timestamp
- `worker`: Process PID for load balancer debugging
- `uptime`: Process uptime in seconds

**Use Case**: Frontend availability detection, load balancer health checks, monitoring systems

### Static File Serving and SPA Routing (`server.mjs:538-605`)

The server implements an optimized static file delivery strategy for the Vite-built frontend:

#### Vite Build Directory Structure

Static files are served from `../gruenerator_frontend/build`:

**Hashed Assets Route** (`/assets/*`)

- Serves JavaScript and CSS bundles with content hashes in filenames
- 1-day cache with `immutable` flag
- ETag support for conditional requests
- Optimal for long-term caching since content changes result in new filenames

**Root Static Files**

- Serves HTML, images, fonts, and other assets
- 1-day cache with ETag validation
- Directory listings disabled for security
- Explicit file extension whitelist: html, js, css, png, jpg, gif, svg, ico

#### SPA Fallback Routing (`server.mjs:568-581`)

All non-API GET requests fall back to `index.html` for client-side routing:

- **API Routes**: Requests starting with `/api` skip to the next handler
- **File Exists**: Returns `index.html` if found
- **File Missing**: Passes error to error handler with specific message
- **Use Case**: React Router handles routing on the client side

#### Special Static Directories

**Video Exports** (`/uploads/exports/*`)

- Custom Content-Type headers for MOV and MP4 files
- Accept-Ranges header for video streaming
- Cross-origin allowed for video embedding
- Cache disabled due to potentially sensitive content

**Sharepic Assets** (`/public/*`)

- Public background images for sharepic generator
- 24-hour cache (86400 seconds)
- Cross-origin allowed for image loading
- Public cache for CDN compatibility

#### Routing Order

Critical middleware order to ensure correct routing:

1. **TUS Upload Handler**: Must come before setupRoutes for resumable uploads
2. **API Routes**: setupRoutes() registers all API endpoints
3. **Multer Upload Middleware**: Applied after routes for specific upload endpoints
4. **Static Assets**: Vite build directory served next
5. **SPA Fallback**: Catch-all for client-side routing

---

## User Management

### User Lifecycle

#### User Creation Flow

1. **New User Registration** (`config/passportSetup.mjs:198-226`)

The `createProfileUser` function generates a new UUID for the user ID using the crypto module. It constructs a profile data object containing the Keycloak ID, username, display name, email (or null), locale (defaulting to 'de-DE'), and login timestamp. Default beta features are initialized with memory_enabled set to false. It then gets the ProfileService instance and calls createProfile with the new user data, returning the created profile.

2. **Profile Creation in Database** (`services/ProfileService.mjs:77-106`)

The `createProfile` method prepares a new profile object by spreading the provided profile data and setting defaults for all feature flags (beta_features as empty object if not provided, igel_modus, bundestag_api_enabled, groups_enabled all defaulting to false). It ensures the database is initialized, then inserts the new profile into the table and returns the result.

#### User Update Flow

1. **Profile Updates** (`services/ProfileService.mjs:111-126`)

The `updateProfile` method ensures the database is initialized, then uses the database service's update method to modify the profile with the given userId. It passes the update data and a where clause matching the user ID, then returns the first result from the data array.

2. **Feature Flag Updates** (`services/ProfileService.mjs:149-199`)

The `updateBetaFeatures` method retrieves the current profile, merges the new feature flag into the existing beta_features JSON object, and prepares an update object. It also maintains backward compatibility by updating individual boolean columns for specific features using a featureColumnMap that maps feature names like 'igel_modus', 'bundestag_api_enabled', and 'groups' to their corresponding database columns. The method then calls updateProfile with the complete update data.

#### User Deletion Flow

1. **Keycloak User Deletion** (`utils/keycloakApiClient.js:280-329`)

The `deleteUser` method in the KeycloakAPI client logs the deletion start, ensures authentication is valid, checks if the user exists in Keycloak (returning true if already deleted), and executes a DELETE request to the Keycloak users endpoint. It logs success and returns true on completion.

2. **Profile Deletion with CASCADE** (`services/ProfileService.mjs:270-307`)

The `deleteProfile` method logs the deletion start, queries the database to retrieve user email and username for logging purposes, logs the user being deleted, executes the delete operation on the profiles table, and logs that CASCADE deletion will automatically remove all related data (documents, group memberships, etc.). The database foreign key constraints handle the cascading deletion automatically.

### Profile Synchronization

#### Keycloak to Database Sync

Profile data flows from Keycloak to the local database during authentication (`config/passportSetup.mjs:99-131`). When an existing user logs in, the system checks if their email has changed in Keycloak. If so, it checks for email conflicts with other users and keeps the existing email to avoid conflicts. It then syncs the profile data by updating the user's display name, username, email, locale, and last_login timestamp while preserving their existing locale preference. The auth source is also recorded.

#### Session to Database Sync

Session updates are preserved during deserialization (`config/passportSetup.mjs:25-72`). When deserializing a user from the session, the system fetches the latest user data from the database but preserves critical session data that might have been updated during the session, including id_token, beta_features JSON object, and individual profile settings like bundestag_api_enabled. This ensures that session-level changes are not lost when the user object is rehydrated.

### User Data Handling

#### Locale Management

The system supports multiple locales with automatic detection (`config/passportSetup.mjs:89-93`). The locale defaults to 'de-DE' for German users. When the authentication source is 'gruene-oesterreich-login' (Austrian Greens), the locale is automatically set to 'de-AT' for Austrian German. This locale setting affects UI language and regional formatting throughout the application.

#### Beta Features Management

Beta features use both JSON and individual columns for flexibility (`services/ProfileService.mjs:353-377`). The `getMergedBetaFeatures` method combines features from both the beta_features JSONB column and individual boolean columns (igel_modus, bundestag_api_enabled, groups_enabled, etc.). It spreads the JSON features first, then overlays the individual column values, ensuring that boolean columns take precedence. This dual storage approach provides backward compatibility while allowing flexible feature flag management.

---

## Code Reference

### Key Files and Responsibilities

| File Path                              | Responsibility                                    | Key Functions                                        |
| -------------------------------------- | ------------------------------------------------- | ---------------------------------------------------- |
| `config/passportSetup.mjs`             | Passport initialization and user profile handling | `handleUserProfile()`, serialization/deserialization |
| `config/keycloakOIDCStrategy.mjs`      | Custom OIDC strategy implementation               | `initiateAuthorization()`, `handleCallback()`        |
| `routes/auth/authCore.mjs`             | Authentication endpoints and flows                | Login, logout, callback, status endpoints            |
| `middleware/authMiddleware.js`         | Request authentication middleware                 | `requireAuth()`, session/JWT validation              |
| `middleware/jwtAuthMiddleware.js`      | JWT token validation                              | Mobile JWT and Keycloak JWT processing               |
| `utils/keycloakApiClient.js`           | Keycloak Admin API operations                     | User CRUD, password management                       |
| `database/services/PostgresService.js` | PostgreSQL abstraction layer                      | Connection pooling, query building, transactions     |
| `services/ProfileService.mjs`          | User profile management                           | Profile CRUD, feature management                     |
| `database/postgres/schema.sql`         | Database schema definition                        | Table structures, indexes, triggers                  |

### Important Configuration Parameters

#### Environment Variables

**Authentication**

- `KEYCLOAK_BASE_URL`: Keycloak server URL (e.g., https://auth.services.moritz-waechter.de)
- `KEYCLOAK_REALM`: Keycloak realm name (e.g., Gruenerator)
- `KEYCLOAK_CLIENT_ID`: OAuth client ID
- `KEYCLOAK_CLIENT_SECRET`: OAuth client secret
- `KEYCLOAK_ADMIN_USERNAME`: Admin username for Keycloak API
- `KEYCLOAK_ADMIN_PASSWORD`: Admin password for Keycloak API

**Database**

- `DATABASE_URL`: Full PostgreSQL connection string (postgres://user:pass@host:5432/gruenerator)
  - OR use discrete variables:
- `POSTGRES_HOST`: Database host (default: localhost)
- `POSTGRES_PORT`: Database port (default: 5432)
- `POSTGRES_USER`: Database user (default: gruenerator)
- `POSTGRES_PASSWORD`: Database password (required)
- `POSTGRES_DATABASE`: Database name (default: gruenerator)
- `POSTGRES_SSL`: Enable SSL connection (true/false)

**Session & Cache**

- `SESSION_SECRET`: Session encryption secret (minimum 32 characters required)
- `REDIS_URL`: Redis connection URL (e.g., redis://localhost:6379)

**Application**

- `BASE_URL`: Public base URL (e.g., https://gruenerator.de)
- `AUTH_BASE_URL`: Authentication callback base URL (e.g., https://gruenerator.de)
- `NODE_ENV`: Environment mode (production/development) - affects CORS, logging, error details
- `HOST`: Server bind address (default: 127.0.0.1)
- `PORT`: Server port (default: 3001)
- `WORKER_COUNT`: Number of cluster workers (default: 2)
- `AI_WORKER_COUNT`: Number of AI worker threads (default: 6)

### Error Handling (`server.mjs:655-695`)

The error handler provides comprehensive error management with environment-aware responses:

#### Error Categories

1. **Authentication Errors** (401)
   - Detects errors with name 'AuthenticationError' or message containing 'authentication'
   - Browser requests: Redirects to `/auth/login`
   - API requests: Returns JSON with error details

2. **File Not Found** (500)
   - Custom message for missing index.html or application files
   - Logged with ENOENT code

3. **Permission Errors** (500)
   - Handles EACCES errors for file access issues

#### Error Response Format

Development mode (`NODE_ENV=development`):

- Full error message
- Complete stack trace
- Error code and type

Production mode:

- User-friendly generic messages in German
- No stack traces (security)
- Error code and type preserved

All responses include:

- `success`: false
- `error`: Generic error message
- `message`: Specific error detail (environment-dependent)
- `errorId`: Unique identifier (timestamp + random) for tracking
- `timestamp`: ISO 8601 timestamp
- `errorCode`: System error code (if available)
- `errorType`: Error class name

### API Endpoints

#### Authentication Endpoints

| Endpoint         | Method   | Description               | Auth Required |
| ---------------- | -------- | ------------------------- | ------------- |
| `/auth/login`    | GET      | Initiate login flow       | No            |
| `/auth/callback` | GET      | OIDC callback handler     | No            |
| `/auth/logout`   | GET/POST | Logout user               | Yes           |
| `/auth/status`   | GET      | Get authentication status | No            |
| `/auth/profile`  | GET      | Get user profile          | Yes           |
| `/auth/locale`   | GET/PUT  | Get/Update user locale    | Yes           |

#### User Management Endpoints

| Endpoint                  | Method  | Description          | Auth Required |
| ------------------------- | ------- | -------------------- | ------------- |
| `/api/user/profile`       | GET/PUT | Get/Update profile   | Yes           |
| `/api/user/beta-features` | PUT     | Update beta features | Yes           |
| `/api/user/avatar`        | PUT     | Update avatar        | Yes           |
| `/api/user/delete`        | DELETE  | Delete user account  | Yes           |

---
