// Service worker for Web Interaction Recorder - Fixed message handling
let isRecording = false;
let interactions = [];
let sessionId = null;
let currentSettings = {
  captureScreenshots: true,
  maskSensitiveData: false
};

// Listen for messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Service Worker] Received message:', message);
  
  try {
    // Handle messages from popup (using 'action' property)
    if (message.action) {
      switch (message.action) {
        case 'GET_RECORDING_STATE':
          sendResponse({
            isRecording,
            interactionCount: interactions.length,
            sessionId: sessionId,
            currentTab: sender.tab ? sender.tab.id : null
          });
          break;
          
        case 'START_RECORDING':
          if (isRecording) {
            sendResponse({ error: 'Recording already in progress' });
            return;
          }
          
          isRecording = true;
          sessionId = Date.now().toString();
          interactions = [];
          currentSettings = message.settings || currentSettings;
          
          // Send message to content script
          if (message.tabId) {
            chrome.tabs.sendMessage(message.tabId, { type: 'start' });
            console.log('[Service Worker] Sent start message to tab');
          }
          
          sendResponse({ 
            success: true,
            data: { sessionId, interactionCount: 0 }
          });
          break;
          
        case 'STOP_RECORDING':
          if (!isRecording) {
            sendResponse({ error: 'No recording in progress' });
            return;
          }
          
          isRecording = false;
          
          // Send message to content script
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.sendMessage(tabs[0].id, { type: 'stop' });
              console.log('[Service Worker] Sent stop message to tab');
            }
          });
          
          sendResponse({ 
            success: true,
            data: { interactionCount: interactions.length }
          });
          break;
          
        case 'EXPORT_RECORDING':
          if (!interactions.length) {
            sendResponse({ error: 'No interactions to export' });
            return;
          }
          
          const exportData = {
            sessionId,
            startTime: new Date(parseInt(sessionId)).toISOString(),
            endTime: new Date().toISOString(),
            interactions,
            metadata: {
              version: '1.0.0',
              userAgent: 'Chrome Extension',
              settings: currentSettings
            }
          };
          
          const jsonString = JSON.stringify(exportData);
          const sizeMB = (jsonString.length / (1024 * 1024)).toFixed(2);
          const filename = `wir_recording_${sessionId}.json`;
          
          sendResponse({
            success: true,
            data: {
              exportData,
              filename,
              sizeMB,
              sizeWarning: sizeMB > 5 ? `Large file size: ${sizeMB}MB` : null,
              interactionCount: interactions.length
            }
          });
          break;
          
        case 'CLEAR_RECORDING':
          interactions = [];
          sessionId = null;
          sendResponse({ success: true });
          break;
          
        default:
          sendResponse({ error: `Unknown action: ${message.action}` });
      }
    }
    
    // Handle messages from content script (using 'type' property)
    else if (message.type) {
      switch (message.type) {
        case 'addInteraction':
          if (isRecording && message.data) {
            interactions.push(message.data);
            console.log('[Service Worker] Added interaction:', message.data.sequenceNumber);
          }
          sendResponse({ success: true });
          break;
          
        case 'captureScreenshot':
          chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
            if (tabs[0]) {
              chrome.tabs.captureVisibleTab(tabs[0].windowId, {format: 'png'}, (dataUrl) => {
                if (chrome.runtime.lastError) {
                  console.error('[Service Worker] Screenshot error:', chrome.runtime.lastError);
                  sendResponse({ screenshot: null });
                } else {
                  sendResponse({ screenshot: dataUrl });
                }
              });
            } else {
              sendResponse({ screenshot: null });
            }
          });
          return true; // Will respond asynchronously
          
        default:
          sendResponse({ error: `Unknown type: ${message.type}` });
      }
    }
    
  } catch (error) {
    console.error('[Service Worker] Error handling message:', error);
    sendResponse({ error: error.message });
  }
  
  return true; // Keep message channel open for async responses
});