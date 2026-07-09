# Wave Browser Frontend - Linux Development Setup

This guide covers setting up the frontend for development on Linux (corporate environment).

## Prerequisites

1. **Node.js 18+** - Load module: `module load node/18.19.1`
2. **System browsers** - Chrome or Firefox should be installed

## Quick Start

### 1. Load Node.js

```bash
module load node/18.19.1
```

### 2. Install Dependencies

```bash
cd /u/avidan/workspaces/wave_browser/frontend
npm install
```

### 3. Initialize MSW (Mock Service Worker)

First time only - generates the service worker file:

```bash
npm run msw:init
```

### 4. Start Development Server

**With real backend:**
```bash
# In another terminal, start the backend first
cd ../backend
module load python/3.11
source .venv/bin/activate
python -m uvicorn app.main:app --reload

# Then start frontend
cd ../frontend
npm run dev
```

**With mock backend:**
```bash
npm run dev:mock
```

---

## E2E Testing with Playwright

### System Browser Configuration

Due to corporate firewall blocking `cdn.playwright.dev`, Playwright is configured to use system-installed browsers instead of downloading them.

The configuration in `playwright.config.ts` automatically detects Linux and uses:
- `/usr/bin/google-chrome` for Chromium tests
- `/usr/bin/firefox` for Firefox tests

### Running Tests

```bash
# Run all tests
npm run test:e2e

# Run tests with browser visible
npm run test:e2e:headed

# Run specific test file
npx playwright test session.spec.ts

# Run specific project (browser)
npx playwright test --project=chromium
npx playwright test --project=firefox

# Debug tests
npm run test:e2e:debug
```

### View Test Report

```bash
npx playwright show-report
```

---

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server (requires backend on port 8000) |
| `npm run dev:mock` | Start dev server with mock API |
| `npm run build` | Build for production |
| `npm run lint` | Run ESLint |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run test:e2e:ui` | Run Playwright with interactive UI |
| `npm run test:e2e:headed` | Run tests in visible browser |
| `npm run test:e2e:debug` | Debug tests with Playwright Inspector |
| `npm run msw:init` | Generate MSW service worker |

---

## Project Structure

```
frontend/
├── CONTEXT.md           # Full API documentation and architecture
├── README-LINUX.md      # This file
├── README-WINDOWS.md    # Windows setup guide
├── e2e/                 # Playwright E2E tests
│   ├── session.spec.ts  # Session dialog tests
│   └── hierarchy.spec.ts # Hierarchy panel tests
├── mocks/               # MSW mock server
│   ├── browser.ts       # Browser worker setup
│   ├── data.ts          # Mock data fixtures
│   ├── handlers.ts      # API mock handlers
│   └── index.ts         # Mock initialization
├── src/
│   ├── api/             # API client
│   ├── components/      # React components
│   ├── store/           # Zustand state
│   └── utils/           # Utilities
├── playwright.config.ts # Playwright config
└── vite.config.ts
```

---

## Troubleshooting

### Tests hang or don't start
Make sure the dev server is not already running on port 5173 if using `webServer` config.

### System browser not found
Verify browser paths:
```bash
which google-chrome firefox
```

Update paths in `playwright.config.ts` if needed.

### X11 display errors
For headless testing (default), no display is needed. For headed tests:
```bash
export DISPLAY=:0  # or appropriate display
npm run test:e2e:headed
```

### Corporate proxy issues
If you see SSL/certificate errors, the corporate firewall may be intercepting traffic. The Playwright config is already set to use system browsers to avoid these issues.

---

## Development Workflow

1. Start backend (if testing full integration):
   ```bash
   cd ../backend && module load python/3.11 && source .venv/bin/activate
   python -m uvicorn app.main:app --reload
   ```

2. Start frontend with hot reload:
   ```bash
   npm run dev   # with backend
   # or
   npm run dev:mock  # standalone
   ```

3. Make changes to source files
4. Browser automatically reloads with changes
5. Run E2E tests to verify:
   ```bash
   npm run test:e2e
   ```

---

## Next Steps

1. Read [CONTEXT.md](./CONTEXT.md) for full API documentation
2. Explore `src/components/` to understand the UI structure
3. Run E2E tests: `npm run test:e2e`
4. View test report: `npx playwright show-report`
