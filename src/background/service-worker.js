// Service Worker - Handles background tasks, messaging, and storage
let recordingState = {
  isRecording: false,
  tabId: null,
  sessionId: null,
  interactions: [],
  startTime: null,
  endTime: null,
  metadata: {}
};

// Error logging helper
function logError(context, error) {
  console.error(`[WIR Service Worker] ${context}:`, error);
  return { error: error.message || 'Unknown error', context };
}

// Success logging helper
function logSuccess(context, data) {
  console.log(`[WIR Service Worker] ${context}:`, data);
  return { success: true, data };
}

console.log('[WIR Service Worker] Initialized');

// Message handler with comprehensive error handling
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[WIR Service Worker] Received message:', request.action);
  
  try {
    switch (request.action) {
      case 'START_RECORDING':
        startRecording(request.tabId)
          .then(result => sendResponse(result))
          .catch(error => sendResponse(logError('START_RECORDING', error)));
        return true;
        
      case 'STOP_RECORDING':
        stopRecording()
          .then(result => sendResponse(result))
          .catch(error => sendResponse(logError('STOP_RECORDING', error)));
        return true;
        
      case 'GET_RECORDING_STATE':
        sendResponse({
          isRecording: recordingState.isRecording,
          interactionCount: recordingState.interactions.length,
          sessionId: recordingState.sessionId,
          tabId: recordingState.tabId,
          startTime: recordingState.startTime
        });
        break;
        
      case 'ADD_INTERACTION':
        if (recordingState.isRecording && sender.tab?.id === recordingState.tabId) {
          addInteraction(request.data)
            .then(result => sendResponse(result))
            .catch(error => sendResponse(logError('ADD_INTERACTION', error)));
        } else {
          sendResponse({ status: 'ignored', reason: 'Not recording or wrong tab' });
        }
        return true;
        
      case 'CAPTURE_SCREENSHOT':
        captureScreenshot(sender.tab.id)
          .then(screenshot => sendResponse({ screenshot }))
          .catch(error => sendResponse(logError('CAPTURE_SCREENSHOT', error)));
        return true;
        
      case 'EXPORT_RECORDING':
        exportRecording()
          .then(result => sendResponse(result))
          .catch(error => sendResponse(logError('EXPORT_RECORDING', error)));
        return true;
        
      case 'CLEAR_RECORDING':
        clearRecording()
          .then(result => sendResponse(result))
          .catch(error => sendResponse(logError('CLEAR_RECORDING', error)));
        return true;
        
      case 'GET_ALL_SESSIONS':
        getAllSessions()
          .then(sessions => sendResponse({ sessions }))
          .catch(error => sendResponse(logError('GET_ALL_SESSIONS', error)));
        return true;
        
      default:
        sendResponse({ error: `Unknown action: ${request.action}` });
    }
  } catch (error) {
    sendResponse(logError('Message handling', error));
  }
});

// Start recording with enhanced error handling
async function startRecording(tabId) {
  try {
    // Verify tab exists
    const tab = await chrome.tabs.get(tabId);
    if (!tab) throw new Error('Tab not found');
    
    // Check if we can inject content script
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) {
      throw new Error('Cannot record on Chrome internal pages');
    }
    
    recordingState = {
      isRecording: true,
      tabId: tabId,
      sessionId: generateSessionId(),
      interactions: [],
      startTime: new Date().toISOString(),
      endTime: null,
      metadata: {
        url: tab.url,
        title: tab.title,
        userAgent: await getUserAgent(),
        viewport: await getViewport(tabId)
      }
    };
    
    // Save initial state
    await chrome.storage.local.set({
      [`wir_session_${recordingState.sessionId}`]: recordingState,
      'wir_active_session': recordingState.sessionId
    });
    
    console.log('[WIR Service Worker] Recording started:', recordingState);
    
    // Set up tab update listener for reload completion
    const tabUpdateListener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(tabUpdateListener);
        
        // Inject content script and send start message
        chrome.scripting.executeScript({
          target: { tabId: tabId },
          files: ['src/content/content-script.js']
        }, () => {
          chrome.tabs.sendMessage(tabId, {
            action: 'RECORDING_STARTED',
            sessionId: recordingState.sessionId
          }).catch(err => {
            console.error('[WIR Service Worker] Failed to send RECORDING_STARTED:', err);
          });
        });
      }
    };
    
    chrome.tabs.onUpdated.addListener(tabUpdateListener);
    
    // Reload the tab to ensure content script is injected
    await chrome.tabs.reload(tabId);
    
    return logSuccess('Recording started', { sessionId: recordingState.sessionId });
  } catch (error) {
    recordingState.isRecording = false;
    throw error;
  }
}

// Stop recording with cleanup
async function stopRecording() {
  try {
    if (!recordingState.isRecording) {
      return { status: 'not_recording' };
    }
    
    recordingState.isRecording = false;
    recordingState.endTime = new Date().toISOString();
    
    // Save final state
    await chrome.storage.local.set({
      [`wir_session_${recordingState.sessionId}`]: recordingState
    });
    
    // Remove active session marker
    await chrome.storage.local.remove('wir_active_session');
    
    // Notify content script
    if (recordingState.tabId) {
      try {
        await chrome.tabs.sendMessage(recordingState.tabId, {
          action: 'RECORDING_STOPPED'
        });
      } catch (err) {
        console.warn('[WIR Service Worker] Could not notify content script:', err);
      }
    }
    
    return logSuccess('Recording stopped', {
      sessionId: recordingState.sessionId,
      interactionCount: recordingState.interactions.length
    });
  } catch (error) {
    throw error;
  }
}

// Add interaction with validation and enhanced error handling
async function addInteraction(interactionData) {
  try {
    if (!recordingState.isRecording) {
      throw new Error('Not recording');
    }
    
    // Deep clone to prevent data corruption
    const interaction = {
      ...interactionData,
      sequenceNumber: recordingState.interactions.length + 1,
      timestamp: new Date().toISOString(),
      sessionTimestamp: Date.now() - new Date(recordingState.startTime).getTime()
    };
    
    // Validate required fields
    if (!interaction.type || !interaction.element) {
      throw new Error('Missing required interaction fields');
    }
    
    // Sanitize screenshot data if present (ensure it's a valid data URL)
    if (interaction.screenshotBefore && !interaction.screenshotBefore.startsWith('data:image/')) {
      console.warn('[WIR Service Worker] Invalid screenshot format, removing');
      delete interaction.screenshotBefore;
    }
    if (interaction.screenshotAfter && !interaction.screenshotAfter.startsWith('data:image/')) {
      console.warn('[WIR Service Worker] Invalid screenshot format, removing');
      delete interaction.screenshotAfter;
    }
    
    recordingState.interactions.push(interaction);
    
    // Check storage size before saving
    let storageData;
    try {
      storageData = JSON.stringify(recordingState);
    } catch (stringifyError) {
      console.error('[WIR Service Worker] Failed to stringify recording state:', stringifyError);
      // Remove the problematic interaction
      recordingState.interactions.pop();
      throw new Error('Interaction data is too complex or contains circular references');
    }
    
    const storageSize = storageData.length;
    const storageSizeMB = storageSize / (1024 * 1024);
    
    // Chrome storage quota is typically 10MB for extensions
    if (storageSizeMB > 8) { // 8MB hard limit (leaving 2MB buffer)
      console.error('[WIR Service Worker] Storage quota exceeded:', storageSizeMB);
      // Remove the interaction to prevent storage failure
      recordingState.interactions.pop();
      throw new Error(`Storage limit exceeded (${storageSizeMB.toFixed(1)}MB). Please export and clear the current recording.`);
    }
    
    if (storageSizeMB > 5) { // 5MB warning threshold
      console.warn('[WIR Service Worker] Storage size warning:', storageSizeMB);
    }
    
    // Save to storage with error handling
    try {
      await chrome.storage.local.set({
        [`wir_session_${recordingState.sessionId}`]: recordingState
      });
    } catch (storageError) {
      console.error('[WIR Service Worker] Storage save failed:', storageError);
      // Remove the interaction that couldn't be saved
      recordingState.interactions.pop();
      
      if (storageError.message?.includes('QUOTA_BYTES')) {
        throw new Error('Chrome storage quota exceeded. Please export and clear the current recording.');
      }
      throw new Error('Failed to save interaction: ' + storageError.message);
    }
    
    return logSuccess('Interaction added', {
      sequenceNumber: interaction.sequenceNumber,
      type: interaction.type,
      storageSizeMB: storageSizeMB.toFixed(2)
    });
  } catch (error) {
    throw error;
  }
}

// Enhanced screenshot capture
async function captureScreenshot(tabId) {
  try {
    // Check if tab is active
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab.id !== tabId) {
      // Switch to the tab temporarily
      await chrome.tabs.update(tabId, { active: true });
    }
    
    const screenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 80 // Reduced quality for smaller size
    });
    
    // Compress if needed (basic size check)
    if (screenshot.length > 500000) { // 500KB
      console.warn('[WIR Service Worker] Large screenshot:', screenshot.length);
    }
    
    return screenshot;
  } catch (error) {
    console.error('[WIR Service Worker] Screenshot capture failed:', error);
    return null;
  }
}

// Export recording with enhanced data and robustness
async function exportRecording() {
  try {
    let sessionData = recordingState;
    
    // If no active recording, get the last session
    if (!sessionData.sessionId || sessionData.interactions.length === 0) {
      const sessions = await getAllSessions();
      if (sessions.length === 0) {
        throw new Error('No recordings found. Please start a new recording first.');
      }
      sessionData = sessions[sessions.length - 1];
    }
    
    // Validate session data
    if (!sessionData || !sessionData.interactions) {
      throw new Error('Invalid session data. The recording may be corrupted.');
    }
    
    // Clean and validate interactions
    const validInteractions = sessionData.interactions.filter(interaction => {
      // Basic validation - ensure required fields exist
      return interaction && interaction.type && interaction.timestamp;
    });
    
    if (validInteractions.length === 0) {
      throw new Error('No valid interactions found in the recording.');
    }
    
    // Prepare export data with all metadata
    const exportData = {
      sessionId: sessionData.sessionId,
      startTime: sessionData.startTime,
      endTime: sessionData.endTime || new Date().toISOString(),
      duration: sessionData.endTime ? 
        new Date(sessionData.endTime) - new Date(sessionData.startTime) : null,
      metadata: {
        ...sessionData.metadata,
        version: '2.0.0',
        extensionName: 'Web Interaction Recorder',
        exportTime: new Date().toISOString(),
        interactionCount: validInteractions.length,
        originalInteractionCount: sessionData.interactions.length,
        dataIntegrity: validInteractions.length === sessionData.interactions.length ? 'intact' : 'partial'
      },
      interactions: validInteractions,
      summary: generateSummary(validInteractions)
    };
    
    // Check data size before stringifying
    let exportSize;
    let jsonString;
    
    try {
      jsonString = JSON.stringify(exportData, null, 2);
      exportSize = jsonString.length;
    } catch (stringifyError) {
      // Handle circular references or other stringify errors
      console.error('[WIR Service Worker] JSON stringify error:', stringifyError);
      
      // Try with a replacer to handle circular references
      const seen = new WeakSet();
      jsonString = JSON.stringify(exportData, (key, value) => {
        if (typeof value === 'object' && value !== null) {
          if (seen.has(value)) {
            return '[Circular Reference]';
          }
          seen.add(value);
        }
        return value;
      }, 2);
      exportSize = jsonString.length;
    }
    
    // Generate filename with sanitization
    const dateStr = new Date().toISOString().split('T')[0];
    const sessionIdShort = sessionData.sessionId.substring(0, 8);
    const filename = `wir_recording_${sessionIdShort}_${dateStr}.json`;
    
    // Size warnings
    const sizeMB = exportSize / (1024 * 1024);
    let sizeWarning = null;
    
    if (sizeMB > 50) {
      sizeWarning = `Warning: Large file size (${sizeMB.toFixed(1)}MB). Download may take time.`;
    } else if (sizeMB > 100) {
      throw new Error(`File too large (${sizeMB.toFixed(1)}MB). Maximum supported size is 100MB.`);
    }
    
    // Return the export data and filename for the popup to handle
    return logSuccess('Export prepared', { 
      exportData: exportData,
      filename: filename,
      size: exportSize,
      sizeMB: sizeMB.toFixed(2),
      sizeWarning: sizeWarning,
      interactionCount: validInteractions.length
    });
  } catch (error) {
    console.error('[WIR Service Worker] Export error:', error);
    throw error;
  }
}

// Get all recording sessions with data validation
async function getAllSessions() {
  try {
    const storage = await chrome.storage.local.get(null);
    const sessions = [];
    const corruptedKeys = [];
    
    for (const [key, value] of Object.entries(storage)) {
      if (key.startsWith('wir_session_')) {
        // Validate session data
        if (value && typeof value === 'object' && value.sessionId && Array.isArray(value.interactions)) {
          sessions.push(value);
        } else {
          console.warn('[WIR Service Worker] Corrupted session found:', key);
          corruptedKeys.push(key);
        }
      }
    }
    
    // Clean up corrupted sessions
    if (corruptedKeys.length > 0) {
      try {
        await chrome.storage.local.remove(corruptedKeys);
        console.log('[WIR Service Worker] Removed corrupted sessions:', corruptedKeys);
      } catch (cleanupError) {
        console.error('[WIR Service Worker] Failed to clean up corrupted sessions:', cleanupError);
      }
    }
    
    // Sort by start time (with null checks)
    sessions.sort((a, b) => {
      const timeA = a.startTime ? new Date(a.startTime).getTime() : 0;
      const timeB = b.startTime ? new Date(b.startTime).getTime() : 0;
      return timeA - timeB;
    });
    
    return sessions;
  } catch (error) {
    console.error('[WIR Service Worker] Error getting sessions:', error);
    throw error;
  }
}

// Clear recording and optionally all sessions
async function clearRecording(clearAll = false) {
  try {
    const keysToRemove = [];
    
    if (clearAll) {
      // Remove all sessions
      const storage = await chrome.storage.local.get(null);
      for (const key of Object.keys(storage)) {
        if (key.startsWith('wir_')) {
          keysToRemove.push(key);
        }
      }
    } else if (recordingState.sessionId) {
      // Remove current session only
      keysToRemove.push(`wir_session_${recordingState.sessionId}`);
    }
    
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }
    
    // Reset state
    recordingState = {
      isRecording: false,
      tabId: null,
      sessionId: null,
      interactions: [],
      startTime: null,
      endTime: null,
      metadata: {}
    };
    
    return logSuccess('Recording cleared', { clearedKeys: keysToRemove.length });
  } catch (error) {
    throw error;
  }
}

// Helper functions
function generateSessionId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).substr(2, 9)}`;
}

async function getUserAgent() {
  return navigator.userAgent;
}

async function getViewport(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId: tabId },
      func: () => ({
        width: window.innerWidth,
        height: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio
      })
    });
    return result.result;
  } catch (error) {
    return { width: null, height: null, devicePixelRatio: null };
  }
}

function generateSummary(interactions) {
  const summary = {
    totalInteractions: interactions.length,
    interactionTypes: {},
    pages: new Set(),
    duration: null
  };
  
  interactions.forEach(interaction => {
    // Count interaction types
    summary.interactionTypes[interaction.type] = 
      (summary.interactionTypes[interaction.type] || 0) + 1;
    
    // Collect unique pages
    if (interaction.context?.pageUrl) {
      summary.pages.add(interaction.context.pageUrl);
    }
  });
  
  summary.pages = Array.from(summary.pages);
  
  if (interactions.length > 0) {
    const firstTime = new Date(interactions[0].timestamp);
    const lastTime = new Date(interactions[interactions.length - 1].timestamp);
    summary.duration = lastTime - firstTime;
  }
  
  return summary;
}

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log('[WIR Service Worker] Extension installed/updated:', details.reason);
  
  if (details.reason === 'install') {
    // Set default settings
    chrome.storage.local.set({
      'wir_settings': {
        captureScreenshots: true,
        maskSensitiveData: false,
        captureNetworkRequests: false,
        maxStorageSize: 10 * 1024 * 1024 // 10MB
      }
    });
  }
});

// Clean up on browser startup
chrome.runtime.onStartup.addListener(() => {
  console.log('[WIR Service Worker] Browser started, checking for incomplete sessions');
  
  chrome.storage.local.get('wir_active_session', (result) => {
    if (result.wir_active_session) {
      console.log('[WIR Service Worker] Found incomplete session:', result.wir_active_session);
      recordingState.isRecording = false;
      chrome.storage.local.remove('wir_active_session');
    }
  });
});