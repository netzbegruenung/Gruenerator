# GitHub Actions Workflows

## Test All Applications (`test-all.yml`)

This workflow runs comprehensive tests for all parts of the application:

- **Main FastAPI** - Python tests for the main backend
- **Electron FastAPI** - Python tests for the Electron-compatible backend  
- **Main Next.js** - Lint, build, and Cypress component tests
- **Electron Next.js** - Lint, build, and Cypress component tests
- **Docker Build** - Verifies Docker image builds successfully

## Testing Locally

Before pushing, you can test everything locally using the provided script:

```bash
./test-local.sh
```

This script runs the same tests that GitHub Actions will run, so you can catch issues early.

## Manual Testing

If you prefer to test individual components:

### FastAPI Tests
```bash
# Main FastAPI
cd servers/fastapi
export APP_DATA_DIRECTORY=/tmp/app_data
export TEMP_DIRECTORY=/tmp/presenton
export DATABASE_URL=sqlite+aiosqlite:///./test.db
export DISABLE_ANONYMOUS_TRACKING=true
export DISABLE_IMAGE_GENERATION=true
export PYTHONPATH=$(pwd)
pytest tests/ -v

# Electron FastAPI
cd electron/servers/fastapi
# Same environment variables as above
pytest tests/ -v
```

### Next.js Tests
```bash
# Main Next.js
cd servers/nextjs
npm run lint
npm run build

# Electron Next.js
cd electron/servers/nextjs
npm run lint
npm run build
```

### Docker Build
```bash
docker build -t presenton:test -f Dockerfile .
docker images | grep presenton:test
```
