let recordingState = {
  isRecording: false,
  tabId: null,
  sessionId: null,
  interactions: []
};

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  switch (request.action) {
    case 'START_RECORDING':
      startRecording(request.tabId);
      sendResponse({ status: 'started' });
      break;
      
    case 'STOP_RECORDING':
      stopRecording();
      sendResponse({ status: 'stopped' });
      break;
      
    case 'GET_RECORDING_STATE':
      sendResponse({ 
        isRecording: recordingState.isRecording,
        interactionCount: recordingState.interactions.length 
      });
      break;
      
    case 'ADD_INTERACTION':
      if (recordingState.isRecording && sender.tab.id === recordingState.tabId) {
        addInteraction(request.data);
      }
      sendResponse({ status: 'added' });
      break;
      
    case 'CAPTURE_SCREENSHOT':
      captureScreenshot(sender.tab.id).then(screenshot => {
        sendResponse({ screenshot });
      });
      return true;
      
    case 'EXPORT_RECORDING':
      exportRecording().then(data => {
        sendResponse({ data });
      });
      return true;
      
    case 'CLEAR_RECORDING':
      clearRecording();
      sendResponse({ status: 'cleared' });
      break;
  }
});

function startRecording(tabId) {
  recordingState = {
    isRecording: true,
    tabId: tabId,
    sessionId: generateSessionId(),
    interactions: [],
    startTime: new Date().toISOString()
  };
  
  chrome.tabs.sendMessage(tabId, { 
    action: 'RECORDING_STARTED',
    sessionId: recordingState.sessionId 
  });
}

function stopRecording() {
  if (recordingState.isRecording && recordingState.tabId) {
    chrome.tabs.sendMessage(recordingState.tabId, { 
      action: 'RECORDING_STOPPED' 
    });
  }
  
  recordingState.isRecording = false;
  recordingState.endTime = new Date().toISOString();
}

function addInteraction(interactionData) {
  const interaction = {
    ...interactionData,
    sequenceNumber: recordingState.interactions.length + 1,
    timestamp: new Date().toISOString()
  };
  
  recordingState.interactions.push(interaction);
  
  chrome.storage.local.set({
    [`session_${recordingState.sessionId}`]: recordingState
  });
}

async function captureScreenshot(tabId) {
  try {
    const screenshot = await chrome.tabs.captureVisibleTab(null, {
      format: 'png',
      quality: 90
    });
    return screenshot;
  } catch (error) {
    console.error('Screenshot capture failed:', error);
    return null;
  }
}

async function exportRecording() {
  const exportData = {
    sessionId: recordingState.sessionId,
    startTime: recordingState.startTime,
    endTime: recordingState.endTime,
    interactions: recordingState.interactions,
    metadata: {
      version: '1.0.0',
      extensionName: 'Web Interaction Recorder'
    }
  };
  
  const blob = new Blob([JSON.stringify(exportData, null, 2)], {
    type: 'application/json'
  });
  
  const url = URL.createObjectURL(blob);
  const filename = `recording_${recordingState.sessionId}.json`;
  
  chrome.downloads.download({
    url: url,
    filename: filename
  });
  
  return exportData;
}

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

function clearRecording() {
  recordingState = {
    isRecording: false,
    tabId: null,
    sessionId: null,
    interactions: []
  };
  
  chrome.storage.local.remove(`session_${recordingState.sessionId}`);
}