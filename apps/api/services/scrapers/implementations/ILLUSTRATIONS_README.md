# Illustration Scrapers

Automated scrapers for downloading free SVG illustrations from popular illustration libraries.

## Available Scrapers

### 1. Undraw Scraper
Downloads all illustrations from [undraw.co](https://undraw.co)

**Features:**
- Downloads all SVG illustrations from undraw.co
- Supports pagination (41 pages, ~1640 illustrations total)
- Automatic retry logic with rate limiting
- Concurrent downloads (configurable)

**Output:** `apps/api/public/illustrations/undraw/`

### 2. Open Doodles Scraper
Downloads all illustrations from [opendoodles.com](https://www.opendoodles.com)

**Features:**
- Downloads SVG illustrations from Open Doodles
- Optional PNG and GIF download support
- Single-page gallery (~40+ doodles)
- Fallback list for resilience

**Output:** `apps/api/public/illustrations/opendoodles/`

## Usage

### Quick Test (Limited Downloads)
```bash
# Test Undraw scraper (downloads 2 pages only)
node apps/api/scripts/test-illustration-scrapers.mjs undraw

# Test Open Doodles scraper
node apps/api/scripts/test-illustration-scrapers.mjs opendoodles

# Test both
node apps/api/scripts/test-illustration-scrapers.mjs both
```

### Full Download (All Illustrations)
```bash
# Download all illustrations from both sources
node apps/api/scripts/download-all-illustrations.mjs

# Download from specific source
node apps/api/scripts/download-all-illustrations.mjs undraw
node apps/api/scripts/download-all-illustrations.mjs opendoodles
```

### Programmatic Usage

#### Undraw
```typescript
import { UndrawScraper } from './services/scrapers/implementations/UndrawScraper.js';

const scraper = new UndrawScraper({
  maxPages: 41,              // Download all pages (default: 41)
  outputDir: './output',     // Custom output directory
  delayMs: 1500,            // Delay between requests (default: 1500ms)
  verbose: true,            // Enable logging
});

const result = await scraper.scrape();
console.log(`Downloaded ${result.documentsProcessed} illustrations`);
```

#### Open Doodles
```typescript
import { OpenDoodlesScraper } from './services/scrapers/implementations/OpenDoodlesScraper.js';

const scraper = new OpenDoodlesScraper({
  outputDir: './output',     // Custom output directory
  downloadPng: false,        // Also download PNG versions
  downloadGif: false,        // Also download GIF versions (where available)
  delayMs: 1000,            // Delay between requests (default: 1000ms)
  verbose: true,            // Enable logging
});

const result = await scraper.scrape();
console.log(`Downloaded ${result.documentsProcessed} files`);
```

## Configuration Options

### UndrawScraperConfig
- `outputDir?: string` - Output directory (default: `apps/api/public/illustrations/undraw`)
- `maxPages?: number` - Maximum pages to scrape (default: 41)
- `delayMs?: number` - Delay between requests in ms (default: 1500)
- `verbose?: boolean` - Enable verbose logging (default: true)

### OpenDoodlesScraperConfig
- `outputDir?: string` - Output directory (default: `apps/api/public/illustrations/opendoodles`)
- `downloadPng?: boolean` - Download PNG versions (default: false)
- `downloadGif?: boolean` - Download GIF versions (default: false)
- `delayMs?: number` - Delay between requests in ms (default: 1000)
- `verbose?: boolean` - Enable verbose logging (default: true)

## Statistics

### Undraw
- **Total illustrations:** ~1640 (as of January 2026)
- **Pages:** 41
- **Format:** SVG only
- **License:** Free for commercial and personal use

### Open Doodles
- **Total illustrations:** ~40+
- **Pages:** 1
- **Formats:** SVG, PNG, GIF (selected illustrations)
- **License:** CC0 Public Domain (no attribution required)
- **Created by:** Pablo Stanley

## Architecture

Both scrapers extend the `BaseScraper` class which provides:
- Retry logic with exponential backoff
- Rate limiting and polite delays
- Error tracking and reporting
- URL validation and normalization
- Session management

### Key Design Patterns
- **Undraw:** Extracts illustration metadata from Next.js page props (JSON embedded in HTML)
- **Open Doodles:** HTML parsing with fallback list for resilience
- **Both:** Batch processing with configurable concurrency

## Error Handling

Scrapers handle common errors gracefully:
- Network timeouts (30s default)
- HTTP errors (automatic retry up to 3 times)
- Invalid URLs (skipped with warning)
- Missing files (404 on PNG/GIF is not considered an error)

Errors are collected and reported in the final result:
```typescript
const result = await scraper.scrape();
if (result.errors.length > 0) {
  console.log('Errors occurred:', result.errors);
}
```

## Output Structure

```
apps/api/public/illustrations/
├── undraw/
│   ├── video-tutorial_ly8k.svg
│   ├── web-development_f0tp.svg
│   └── ... (~1640 files)
└── opendoodles/
    ├── bikini.svg
    ├── dancing.svg
    ├── meditating.svg
    └── ... (~40+ files)
```

## Rate Limiting

To be respectful to the source servers:
- Undraw: 1500ms delay between requests (configurable)
- Open Doodles: 1000ms delay between requests (configurable)
- Concurrent downloads limited to 3-5 files at a time

## Updating Illustrations

To refresh your illustration library:

```bash
# Full update (re-download all illustrations)
node apps/api/scripts/download-all-illustrations.mjs

# This will overwrite existing files with the latest versions
```

## Troubleshooting

### No illustrations found
- Check your internet connection
- Verify the source websites are accessible
- Enable verbose logging to see detailed information

### Download failures
- Increase the delay between requests (`delayMs`)
- Reduce concurrent downloads (`maxConcurrent`)
- Check available disk space

### Path issues
- Scrapers use relative paths from the scraper location
- Default output is `apps/api/public/illustrations/`
- Override with custom `outputDir` if needed

## License Information

### Illustrations
- **Undraw:** Free for commercial and personal use (check undraw.co for current license)
- **Open Doodles:** CC0 Public Domain (no attribution required)

### Scraper Code
Part of the Grünerator project. See main project LICENSE file.
