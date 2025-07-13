###############################################################################
# WEB INTERACTION RECORDER CHROME EXTENSION - EXPORT README
###############################################################################

This export contains the complete Web Interaction Recorder Chrome Extension
codebase divided into 10 logical text files for easy reconstruction.

## EXPORT FILE CONTENTS:

1. export-01-core-config.txt
   - manifest.json (Chrome extension configuration)
   - package.json (Node.js package configuration)

2. export-02-documentation.txt
   - README.md (Project overview and features)
   - INSTALLATION.md (Installation and usage guide)
   - CLAUDE.md (AI assistant guidance)

3. export-03-service-worker.txt
   - src/background/service-worker.js (Background script)

4. export-04-content-script.txt
   - src/content/content-script.js (Page interaction capture)

5. export-05-popup-ui-html-css.txt
   - src/popup/popup.html (Extension popup HTML)
   - src/popup/popup.css (Extension popup styles)

6. export-06-popup-ui-javascript.txt
   - src/popup/popup.js (Extension popup logic)

7. export-07-utilities.txt
   - src/utils/element-analyzer.js (DOM element analysis)
   - src/utils/storage-manager.js (Chrome storage management)

8. export-08-test-pages.txt
   - test-page.html (Comprehensive test page)
   - test-minimal.html (Minimal test page)
   - test-export.html (Export function test)

9. export-09-debug-diagnostic.txt
   - debug-test.html (Debug test page)
   - diagnostic.html (Diagnostic tool page)

10. export-10-assets.txt
    - assets/icons/icon.svg (SVG icon)
    - Notes about binary PNG files

## HOW TO RECONSTRUCT THE PROJECT:

1. Create the project directory structure:
   ```
   virtuoso-extension-recorder/
   ├── assets/
   │   └── icons/
   ├── src/
   │   ├── background/
   │   ├── content/
   │   ├── popup/
   │   └── utils/
   ```

2. Extract files from each export file and place them in their respective locations

3. Create the missing PNG icon files (16x16, 48x48, 128x128) or use placeholder images

4. Load the extension in Chrome:
   - Navigate to chrome://extensions/
   - Enable Developer mode
   - Click "Load unpacked"
   - Select the project directory

## PROJECT SUMMARY:

The Web Interaction Recorder is a Chrome Extension (Manifest V3) that records 
user interactions on web applications with comprehensive context capture for 
AI-powered test generation. It captures:

- User interactions (clicks, keyboard input, form changes)
- Screenshots (before/after each interaction)
- DOM element details and multiple selector strategies
- Page context and element relationships

The recorded data is exported as JSON for use in automated test generation
or user behavior analysis.