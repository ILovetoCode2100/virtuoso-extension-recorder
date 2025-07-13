# Installation and Usage Guide

## Installation

### 1. Load the Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top right corner
3. Click "Load unpacked" button
4. Select the `virtuoso-extension-recorder` directory
5. The extension will be loaded and its icon will appear in the Chrome toolbar

### 2. Pin the Extension (Optional)

1. Click the puzzle piece icon in the Chrome toolbar
2. Find "Web Interaction Recorder"
3. Click the pin icon to keep it visible in the toolbar

## Usage

### Recording a Session

1. **Navigate to the target website**
   - Open the web page you want to record interactions on
   - For testing, you can open the included `test-page.html` file

2. **Start Recording**
   - Click the extension icon in the toolbar
   - Click "Start Recording"
   - The page will reload to inject the recording scripts
   - The popup will close automatically

3. **Perform Interactions**
   - Click buttons, links, and other elements
   - Fill out forms
   - Type text
   - Navigate through the application
   - All interactions will be recorded with screenshots

4. **Stop Recording**
   - Click the extension icon again
   - The status will show "Recording..." with the interaction count
   - Click "Stop Recording"

5. **Export the Recording**
   - Click "Export Recording"
   - A JSON file will be downloaded with all recorded interactions
   - The file includes screenshots, element selectors, and context

### Understanding the Exported Data

The exported JSON file contains:

- **Session Information**: ID, start/end times
- **Interactions Array**: Each interaction includes:
  - Timestamp and sequence number
  - Interaction type (click, input, etc.)
  - Element details (HTML, attributes, styles)
  - Multiple selector strategies
  - Screenshots (before and after)
  - Natural language description
  - Page context

### Testing the Extension

1. Open `test-page.html` in Chrome
2. Start recording
3. Try these interactions:
   - Fill out the form fields
   - Select dropdown options
   - Check/uncheck boxes
   - Click various buttons
   - Toggle content visibility
   - Add/remove list items
   - Open and close the modal

4. Stop recording and export
5. Review the JSON file to see captured data

## Troubleshooting

### Extension Not Working

- Ensure Developer mode is enabled
- Check Chrome console for errors (F12)
- Try reloading the extension
- Some websites may block extensions

### Screenshots Not Capturing

- The extension needs permission to capture tabs
- Some protected pages may prevent screenshots
- Check if the site uses restrictive CSP headers

### Missing Interactions

- Very rapid interactions might be missed
- Ensure the page is fully loaded before interacting
- Some dynamic content may need special handling

## Advanced Settings

In the popup, you can toggle:

- **Capture screenshots**: Enable/disable screenshot capture
- **Mask sensitive data**: Enable/disable privacy features (coming soon)

## Development Tips

### Viewing Console Logs

- **Content Script logs**: Open DevTools on the web page
- **Service Worker logs**: Go to `chrome://extensions/`, find the extension, click "service worker"
- **Popup logs**: Right-click the popup and select "Inspect"

### Modifying the Extension

1. Make changes to the source files
2. Go to `chrome://extensions/`
3. Click the refresh icon on the extension card
4. Test your changes

### Storage Inspection

1. Open DevTools on any page
2. Go to Application tab
3. Find "Storage" > "Chrome Storage" > "Local"
4. Look for keys starting with `wir_`