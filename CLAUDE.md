# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Chrome Extension (Manifest V3) that records user interactions on web applications with comprehensive context capture for AI-powered test generation. The extension captures user actions along with screenshots, DOM context, and generates multiple selector strategies for reliable element identification.

## Architecture and Component Communication

The extension uses Chrome's message passing API with a command pattern between three main components:

1. **Service Worker** (`src/background/service-worker.js`) - Maintains global recording state and coordinates components
2. **Content Script** (`src/content/content-script.js`) - Injected into pages to capture interactions
3. **Popup UI** (`src/popup/popup.html|js|css`) - User interface for recording controls

### Message Flow
- Popup → Service Worker: `START_RECORDING`, `STOP_RECORDING`, `GET_RECORDING_STATE`
- Content Script → Service Worker: `ADD_INTERACTION`, `CAPTURE_SCREENSHOT`
- Service Worker → Content Script: `RECORDING_STARTED`, `RECORDING_STOPPED`

### Recording Lifecycle
1. User clicks "Start Recording" in popup
2. Service worker sets recording state and messages content script
3. Tab reloads to ensure content script injection
4. Content script attaches event listeners (capture phase on document)
5. Each interaction triggers screenshot capture and data collection
6. Service worker stores interactions with sequence numbers
7. Export generates JSON with all captured data

## Key Technical Patterns

### Selector Generation Priority
The system generates multiple selectors with priority ordering:
1. ID selector (highest)
2. Data-testid attributes
3. ARIA labels
4. Unique CSS classes
5. Optimized CSS path
6. XPath (fallback)

### Screenshot Timing
- Captures BEFORE screenshot immediately
- Captures AFTER screenshot with 300ms delay to catch state changes

### Element Text Extraction Hierarchy
1. ARIA label
2. innerText
3. Value attribute
4. Placeholder
5. Title attribute
6. Alt text

### Storage Pattern
- Uses prefix `wir_` for all storage keys
- Session indexing for managing multiple recordings
- 10MB storage limit implemented

## Development Commands

This is a minimal extension with no build process:
- **Reload Extension**: Chrome Extensions page → Click refresh icon on extension card
- **View Logs**:
  - Content script: DevTools on the web page
  - Service worker: Chrome Extensions page → "service worker" link
  - Popup: Right-click popup → Inspect
- **Test**: Open `test-page.html` in Chrome

## Important Implementation Details

### Missing Functionality
- Icon PNG files referenced in manifest don't exist (only SVG present)
- Sensitive data masking checkbox exists but isn't implemented
- Storage compression in `storage-manager.js` is placeholder only

### Event Capture Strategy
- Uses capture phase (`addEventListener(..., true)`) for reliability
- Captures: clicks, keyboard, form changes, scroll, focus/blur
- All event handlers follow pattern: `handle{EventType}` → `captureInteraction`

### Element Analysis (`src/utils/element-analyzer.js`)
- Classifies button purposes (submit, cancel, delete, etc.)
- Identifies form vs non-form contexts
- Generates natural language descriptions
- Handles implicit ARIA roles

### Critical Timing Considerations
- 500ms delay after starting recording before popup closes
- 300ms delay for after-screenshots
- 1-second polling interval for popup state updates

## Common Tasks

### Adding New Interaction Types
1. Add event handler in `eventHandlers` object in content-script.js
2. Create `handle{EventType}` function following existing patterns
3. Ensure proper data is passed to `captureInteraction`

### Modifying Selector Strategies
Edit `generateSelectors` method in element-analyzer.js - maintain priority ordering

### Changing Storage Limits
Update `MAX_STORAGE_SIZE` in storage-manager.js

### Adding New Message Types
1. Add case in service-worker.js message listener
2. Add corresponding handler in content-script.js if needed
3. Update popup.js if UI interaction required

## Debugging Tips

- Recording state persists in service worker between popup opens
- Content script only active after tab reload when recording starts
- Check for Chrome storage quota errors in service worker logs
- Screenshots may fail on protected pages (chrome://, bank sites, etc.)