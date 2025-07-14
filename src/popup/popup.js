// Popup UI Controller - Enhanced with error handling and better UX
let isRecording = false;
let currentTabId = null;
let pollingInterval = null;
let sessionInfo = null;

// DOM Elements
const elements = {
  startBtn: document.getElementById('startBtn'),
  stopBtn: document.getElementById('stopBtn'),
  exportBtn: document.getElementById('exportBtn'),
  clearBtn: document.getElementById('clearBtn'),
  statusIndicator: document.getElementById('statusIndicator'),
  statusText: document.getElementById('statusText'),
  interactionCount: document.getElementById('interactionCount'),
  captureScreenshots: document.getElementById('captureScreenshots'),
  maskSensitiveData: document.getElementById('maskSensitiveData'),
  errorMessage: document.getElementById('errorMessage'),
  sessionInfo: document.getElementById('sessionInfo'),
  viewSessions: document.getElementById('viewSessions')
};

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab.id;
    
    // Check if we can record on this tab
    if (!canRecordOnTab(tab)) {
      showError(`Cannot record on ${tab.url.startsWith('chrome://') ? 'Chrome internal pages' : 'this page'}`);
      disableAllButtons();
      return;
    }
    
    // Load saved settings
    await loadSettings();
    
    // Update UI state
    await updateRecordingState();
    
    // Attach event listeners
    attachEventListeners();
    
    // Start polling for state updates
    startPolling();
    
  } catch (error) {
    console.error('[WIR Popup] Initialization error:', error);
    showError('Failed to initialize extension');
  }
});

// Check if we can record on this tab
function canRecordOnTab(tab) {
  const restrictedUrls = [
    'chrome://',
    'chrome-extension://',
    'edge://',
    'about:',
    'file:///'
  ];
  
  return !restrictedUrls.some(prefix => tab.url.startsWith(prefix));
}

// Attach event listeners
function attachEventListeners() {
  elements.startBtn?.addEventListener('click', startRecording);
  elements.stopBtn?.addEventListener('click', stopRecording);
  elements.exportBtn?.addEventListener('click', exportRecording);
  elements.clearBtn?.addEventListener('click', clearRecording);
  elements.viewSessions?.addEventListener('click', viewAllSessions);
  
  // Settings listeners
  elements.captureScreenshots?.addEventListener('change', saveSettings);
  elements.maskSensitiveData?.addEventListener('change', saveSettings);
}

// Update recording state
async function updateRecordingState() {
  try {
    chrome.runtime.sendMessage({ action: 'GET_RECORDING_STATE' }, response => {
      if (chrome.runtime.lastError) {
        console.error('[WIR Popup] Error getting state:', chrome.runtime.lastError);
        return;
      }
      
      if (!response) {
        console.error('[WIR Popup] No response from background');
        return;
      }
      
      console.log('[WIR Popup] Recording state:', response);
      
      isRecording = response.isRecording;
      const interactionCount = response.interactionCount || 0;
      sessionInfo = response.sessionId ? {
        sessionId: response.sessionId,
        startTime: response.startTime,
        tabId: response.tabId
      } : null;
      
      updateUI(isRecording, interactionCount);
    });
  } catch (error) {
    console.error('[WIR Popup] Error updating state:', error);
  }
}

// Update UI based on state
function updateUI(recording, count) {
  if (recording) {
    elements.statusIndicator?.classList.add('recording');
    elements.statusIndicator?.classList.remove('idle');
    elements.statusText.textContent = 'Recording...';
    elements.startBtn.disabled = true;
    elements.stopBtn.disabled = false;
    elements.exportBtn.disabled = true;
    elements.clearBtn.disabled = true;
    
    // Show session info
    if (sessionInfo && elements.sessionInfo) {
      const duration = Date.now() - new Date(sessionInfo.startTime).getTime();
      const minutes = Math.floor(duration / 60000);
      const seconds = Math.floor((duration % 60000) / 1000);
      elements.sessionInfo.innerHTML = `
        <div class="session-info">
          <span>Session: ${sessionInfo.sessionId.substring(0, 8)}...</span>
          <span>Duration: ${minutes}:${seconds.toString().padStart(2, '0')}</span>
        </div>
      `;
      elements.sessionInfo.style.display = 'block';
    }
  } else {
    elements.statusIndicator?.classList.remove('recording');
    elements.statusIndicator?.classList.add('idle');
    elements.statusText.textContent = 'Not Recording';
    elements.startBtn.disabled = false;
    elements.stopBtn.disabled = true;
    elements.exportBtn.disabled = count === 0;
    elements.clearBtn.disabled = count === 0;
    
    if (elements.sessionInfo) {
      elements.sessionInfo.style.display = 'none';
    }
  }
  
  // Update interaction count
  elements.interactionCount.textContent = `${count} interaction${count !== 1 ? 's' : ''} recorded`;
  
  // Update button states
  updateButtonStates(recording, count);
}

// Update button states with better UX
function updateButtonStates(recording, count) {
  // Start button
  if (elements.startBtn) {
    elements.startBtn.classList.toggle('disabled', recording);
    elements.startBtn.innerHTML = recording ? 
      '<span class="icon">⏸</span> Recording...' : 
      '<span class="icon">⏺</span> Start Recording';
  }
  
  // Stop button
  if (elements.stopBtn) {
    elements.stopBtn.classList.toggle('disabled', !recording);
  }
  
  // Export button
  if (elements.exportBtn) {
    elements.exportBtn.classList.toggle('disabled', count === 0);
    elements.exportBtn.title = count === 0 ? 'No interactions to export' : 'Export recording as JSON';
  }
  
  // Clear button
  if (elements.clearBtn) {
    elements.clearBtn.classList.toggle('disabled', count === 0);
  }
}

// Start recording
async function startRecording() {
  try {
    showLoading('Starting recording...');
    
    chrome.runtime.sendMessage({
      action: 'START_RECORDING',
      tabId: currentTabId,
      settings: getSettings()
    }, response => {
      hideLoading();
      
      if (chrome.runtime.lastError) {
        showError('Failed to start recording: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response?.error) {
        showError(response.error);
        return;
      }
      
      if (response?.success) {
        isRecording = true;
        updateRecordingState();
        showSuccess('Recording started');
        
        // Reload tab and close popup after a delay
        chrome.tabs.reload(currentTabId, () => {
          setTimeout(() => {
            window.close();
          }, 500);
        });
      }
    });
  } catch (error) {
    hideLoading();
    showError('Failed to start recording: ' + error.message);
  }
}

// Stop recording
async function stopRecording() {
  try {
    showLoading('Stopping recording...');
    
    chrome.runtime.sendMessage({ action: 'STOP_RECORDING' }, response => {
      hideLoading();
      
      if (chrome.runtime.lastError) {
        showError('Failed to stop recording: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response?.error) {
        showError(response.error);
        return;
      }
      
      if (response?.success) {
        isRecording = false;
        updateRecordingState();
        showSuccess(`Recording stopped. ${response.data?.interactionCount || 0} interactions captured.`);
      }
    });
  } catch (error) {
    hideLoading();
    showError('Failed to stop recording: ' + error.message);
  }
}

// Export recording with enhanced error handling and robustness
async function exportRecording() {
  try {
    showLoading('Preparing export...');
    
    chrome.runtime.sendMessage({ action: 'EXPORT_RECORDING' }, response => {
      hideLoading();
      
      // Handle Chrome runtime errors
      if (chrome.runtime.lastError) {
        console.error('[WIR Popup] Runtime error:', chrome.runtime.lastError);
        showError('Export failed: ' + chrome.runtime.lastError.message);
        return;
      }
      
      // Handle service worker errors
      if (response?.error) {
        console.error('[WIR Popup] Export error:', response.error);
        showError(response.error);
        return;
      }
      
      // Validate response data
      if (!response?.success || !response?.data) {
        console.error('[WIR Popup] Invalid response:', response);
        showError('Export failed: Invalid response from extension');
        return;
      }
      
      const { exportData, filename, sizeMB, sizeWarning, interactionCount } = response.data;
      
      if (!exportData) {
        showError('Export failed: No recording data available');
        return;
      }
      
      // Show size warning if needed
      if (sizeWarning) {
        showMessage(sizeWarning, 'warning');
      }
      
      try {
        // Create blob with error handling
        let blob;
        let jsonString;
        
        try {
          jsonString = JSON.stringify(exportData, null, 2);
        } catch (stringifyError) {
          console.error('[WIR Popup] JSON stringify error:', stringifyError);
          // Try without formatting
          try {
            jsonString = JSON.stringify(exportData);
          } catch (secondError) {
            showError('Export failed: Unable to process recording data');
            return;
          }
        }
        
        blob = new Blob([jsonString], {
          type: 'application/json;charset=utf-8'
        });
        
        // Check blob size
        if (blob.size === 0) {
          showError('Export failed: Generated file is empty');
          return;
        }
        
        // Create download with fallback methods
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || `wir_recording_${Date.now()}.json`;
        
        // Handle download blocking
        a.addEventListener('click', () => {
          // Track download attempt
          console.log('[WIR Popup] Download initiated:', a.download);
        });
        
        // Try to download
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        // Clean up with delay to ensure download starts
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch (revokeError) {
            console.warn('[WIR Popup] Failed to revoke URL:', revokeError);
          }
        }, 5000);
        
        // Show success with details
        const message = `Recording exported successfully!
          <br>File: ${filename}
          <br>Size: ${sizeMB}MB
          <br>Interactions: ${interactionCount}`;
        
        showSuccess(message);
        
        // Log success for debugging
        console.log('[WIR Popup] Export successful:', {
          filename,
          size: blob.size,
          sizeMB,
          interactionCount
        });
        
      } catch (downloadError) {
        console.error('[WIR Popup] Download error:', downloadError);
        
        // Fallback: Try alternative download method
        try {
          const jsonString = JSON.stringify(exportData, null, 2);
          const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonString);
          
          const a = document.createElement('a');
          a.href = dataUri;
          a.download = filename || `wir_recording_${Date.now()}.json`;
          a.click();
          
          showSuccess('Recording exported using fallback method');
        } catch (fallbackError) {
          console.error('[WIR Popup] Fallback download error:', fallbackError);
          showError('Export failed: Unable to download file. Please check your browser settings.');
        }
      }
    });
  } catch (error) {
    hideLoading();
    console.error('[WIR Popup] Export error:', error);
    showError('Export failed: ' + error.message);
  }
}

// Clear recording
async function clearRecording() {
  if (!confirm('Are you sure you want to clear the current recording? This cannot be undone.')) {
    return;
  }
  
  try {
    showLoading('Clearing recording...');
    
    chrome.runtime.sendMessage({ action: 'CLEAR_RECORDING' }, response => {
      hideLoading();
      
      if (chrome.runtime.lastError) {
        showError('Failed to clear: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (response?.error) {
        showError(response.error);
        return;
      }
      
      if (response?.success) {
        updateRecordingState();
        showSuccess('Recording cleared');
      }
    });
  } catch (error) {
    hideLoading();
    showError('Failed to clear recording: ' + error.message);
  }
}

// View all sessions
async function viewAllSessions() {
  try {
    chrome.runtime.sendMessage({ action: 'GET_ALL_SESSIONS' }, response => {
      if (response?.sessions && response.sessions.length > 0) {
        console.log('[WIR Popup] Sessions:', response.sessions);
        // Could open a new tab with session list
        showSuccess(`${response.sessions.length} session(s) found`);
      } else {
        showInfo('No recorded sessions found');
      }
    });
  } catch (error) {
    showError('Failed to get sessions: ' + error.message);
  }
}

// Settings management
async function loadSettings() {
  try {
    const result = await chrome.storage.local.get('wir_settings');
    const settings = result.wir_settings || {
      captureScreenshots: true,
      maskSensitiveData: false
    };
    
    if (elements.captureScreenshots) {
      elements.captureScreenshots.checked = settings.captureScreenshots;
    }
    if (elements.maskSensitiveData) {
      elements.maskSensitiveData.checked = settings.maskSensitiveData;
    }
  } catch (error) {
    console.error('[WIR Popup] Failed to load settings:', error);
  }
}

async function saveSettings() {
  try {
    const settings = getSettings();
    await chrome.storage.local.set({ 'wir_settings': settings });
    showSuccess('Settings saved');
  } catch (error) {
    showError('Failed to save settings');
  }
}

function getSettings() {
  return {
    captureScreenshots: elements.captureScreenshots?.checked ?? true,
    maskSensitiveData: elements.maskSensitiveData?.checked ?? false
  };
}

// UI Helper functions
function showError(message) {
  showMessage(message, 'error');
}

function showSuccess(message) {
  showMessage(message, 'success');
}

function showInfo(message) {
  showMessage(message, 'info');
}

function showMessage(message, type = 'info') {
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.innerHTML = `
    <span class="notification-icon">${getIcon(type)}</span>
    <span class="notification-text">${message}</span>
  `;
  
  document.body.appendChild(notification);
  
  // Animate in
  setTimeout(() => notification.classList.add('show'), 10);
  
  // Remove after delay
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function getIcon(type) {
  const icons = {
    error: '❌',
    success: '✅',
    info: 'ℹ️',
    warning: '⚠️'
  };
  return icons[type] || icons.info;
}

function showLoading(message = 'Loading...') {
  const loader = document.createElement('div');
  loader.id = 'loader';
  loader.className = 'loader';
  loader.innerHTML = `
    <div class="loader-spinner"></div>
    <div class="loader-text">${message}</div>
  `;
  document.body.appendChild(loader);
}

function hideLoading() {
  const loader = document.getElementById('loader');
  if (loader) {
    loader.remove();
  }
}

function disableAllButtons() {
  Object.values(elements).forEach(element => {
    if (element && element.tagName === 'BUTTON') {
      element.disabled = true;
    }
  });
}

// Polling for state updates
function startPolling() {
  // Update immediately
  updateRecordingState();
  
  // Then poll every second
  pollingInterval = setInterval(() => {
    updateRecordingState();
  }, 1000);
}

// Clean up on unload
window.addEventListener('unload', () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }
});