# Web Interaction Recorder Chrome Extension

A Chrome extension that records user interactions on web applications with comprehensive context capture for AI-powered test generation.

## Features

- **Comprehensive Interaction Recording**
  - Mouse events (clicks, double-clicks, right-clicks)
  - Keyboard events (key presses, text input)
  - Form interactions (input changes, selections, submissions)
  - Scroll events
  - Focus/blur events

- **Screenshot Capture**
  - Before/after screenshots for each interaction
  - Full viewport captures
  - Optimized storage with base64 encoding

- **DOM Context Capture**
  - Target element details (HTML, attributes, computed styles)
  - Multiple selector strategies (ID, CSS, XPath, text)
  - Parent and sibling element context
  - Form context detection

- **Smart Features**
  - Natural language descriptions for each interaction
  - Sequential flow tracking
  - Session management
  - Export to JSON format

## Installation

1. Clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension icon will appear in your Chrome toolbar

## Usage

1. Click the extension icon to open the popup
2. Navigate to the web page you want to record
3. Click "Start Recording" to begin capturing interactions
4. Perform your interactions on the page
5. Click the extension icon again and click "Stop Recording"
6. Click "Export Recording" to download the session data as JSON

## Project Structure

```
├── manifest.json           # Extension manifest (V3)
├── src/
│   ├── background/        # Service worker
│   │   └── service-worker.js
│   ├── content/          # Content scripts
│   │   └── content-script.js
│   ├── popup/           # Extension popup
│   │   ├── popup.html
│   │   ├── popup.css
│   │   └── popup.js
│   └── utils/          # Utility functions
└── assets/
    └── icons/          # Extension icons
```

## Exported Data Format

Each recording session exports a JSON file with the following structure:

```json
{
  "sessionId": "unique-session-id",
  "startTime": "2024-01-15T10:30:00.000Z",
  "endTime": "2024-01-15T10:35:00.000Z",
  "interactions": [
    {
      "sequenceNumber": 1,
      "timestamp": "2024-01-15T10:30:45.123Z",
      "type": "click",
      "interaction": {
        "type": "click",
        "coordinates": { "x": 234, "y": 456 },
        "mouseButton": "left"
      },
      "element": {
        "tagName": "button",
        "type": "submit",
        "text": "Submit Order",
        "html": "<button class='btn-primary'>Submit Order</button>",
        "attributes": { ... },
        "computedStyles": { ... },
        "selectors": {
          "id": "#submit-btn",
          "css": ".btn-primary",
          "xpath": "//button[@id='submit-btn']",
          "text": "button:contains('Submit Order')"
        }
      },
      "context": {
        "url": "https://example.com/checkout",
        "pageTitle": "Checkout - Example Store",
        "parentElements": [ ... ],
        "formContext": { ... }
      },
      "screenshots": {
        "before": "data:image/png;base64,...",
        "after": "data:image/png;base64,..."
      },
      "nlpDescription": "Click the 'Submit Order' button"
    }
  ]
}
```

## Development

### Phase 1 (Completed)
- ✅ Basic Chrome extension structure with Manifest V3
- ✅ Core interaction recording (clicks, keyboard, forms)
- ✅ Screenshot capture functionality
- ✅ Basic DOM context capture
- ✅ Popup UI for recording controls
- ✅ Export to JSON format

### Phase 2 (In Progress)
- 🔄 Enhanced selector generation strategies
- 🔄 Improved element classification
- 🔄 Storage optimization for large sessions

### Phase 3 (Planned)
- Smart element classification
- Interaction grouping and workflow detection
- Natural language processing improvements

### Phase 4 (Planned)
- Performance optimizations
- Advanced privacy features
- Integration with test generation systems

## Known Limitations

- Screenshots are captured using Chrome's tab capture API (may not work on some protected pages)
- Storage is limited to Chrome's local storage quota
- Some dynamic elements may require additional handling

## Privacy & Security

- All data is stored locally in the browser
- No external connections are made
- Sensitive data masking can be enabled in settings
- Extension requires explicit user action to start recording

## License

This project is provided as-is for educational and development purposes.