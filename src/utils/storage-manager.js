class StorageManager {
  constructor() {
    this.STORAGE_KEY_PREFIX = 'wir_';
    this.MAX_STORAGE_SIZE = 10 * 1024 * 1024; // 10MB limit
    this.screenshotCache = new Map();
  }

  async saveSession(sessionData) {
    const key = `${this.STORAGE_KEY_PREFIX}session_${sessionData.sessionId}`;
    
    try {
      await this.checkStorageQuota();
      
      const compressedData = await this.compressSessionData(sessionData);
      
      await chrome.storage.local.set({
        [key]: compressedData
      });
      
      await this.updateSessionIndex(sessionData.sessionId);
      
      return true;
    } catch (error) {
      console.error('Failed to save session:', error);
      return false;
    }
  }

  async loadSession(sessionId) {
    const key = `${this.STORAGE_KEY_PREFIX}session_${sessionId}`;
    
    try {
      const result = await chrome.storage.local.get(key);
      
      if (result[key]) {
        return await this.decompressSessionData(result[key]);
      }
      
      return null;
    } catch (error) {
      console.error('Failed to load session:', error);
      return null;
    }
  }

  async getAllSessions() {
    try {
      const indexKey = `${this.STORAGE_KEY_PREFIX}session_index`;
      const result = await chrome.storage.local.get(indexKey);
      
      if (result[indexKey]) {
        const sessionIds = result[indexKey];
        const sessions = [];
        
        for (const sessionId of sessionIds) {
          const session = await this.loadSession(sessionId);
          if (session) {
            sessions.push({
              sessionId: session.sessionId,
              startTime: session.startTime,
              endTime: session.endTime,
              interactionCount: session.interactions.length
            });
          }
        }
        
        return sessions;
      }
      
      return [];
    } catch (error) {
      console.error('Failed to get sessions:', error);
      return [];
    }
  }

  async deleteSession(sessionId) {
    const key = `${this.STORAGE_KEY_PREFIX}session_${sessionId}`;
    
    try {
      await chrome.storage.local.remove(key);
      await this.removeFromSessionIndex(sessionId);
      return true;
    } catch (error) {
      console.error('Failed to delete session:', error);
      return false;
    }
  }

  async clearAllSessions() {
    try {
      const sessions = await this.getAllSessions();
      
      for (const session of sessions) {
        await this.deleteSession(session.sessionId);
      }
      
      return true;
    } catch (error) {
      console.error('Failed to clear sessions:', error);
      return false;
    }
  }

  async compressSessionData(sessionData) {
    const compressedInteractions = sessionData.interactions.map(interaction => {
      const compressed = { ...interaction };
      
      if (compressed.screenshots) {
        if (compressed.screenshots.before) {
          compressed.screenshots.before = this.compressImage(compressed.screenshots.before);
        }
        if (compressed.screenshots.after) {
          compressed.screenshots.after = this.compressImage(compressed.screenshots.after);
        }
      }
      
      return compressed;
    });
    
    return {
      ...sessionData,
      interactions: compressedInteractions
    };
  }

  async decompressSessionData(compressedData) {
    return compressedData;
  }

  compressImage(base64Image) {
    return base64Image;
  }

  async checkStorageQuota() {
    return new Promise((resolve, reject) => {
      chrome.storage.local.getBytesInUse(null, (bytesInUse) => {
        if (bytesInUse > this.MAX_STORAGE_SIZE) {
          reject(new Error('Storage quota exceeded'));
        } else {
          resolve(bytesInUse);
        }
      });
    });
  }

  async updateSessionIndex(sessionId) {
    const indexKey = `${this.STORAGE_KEY_PREFIX}session_index`;
    
    try {
      const result = await chrome.storage.local.get(indexKey);
      const sessionIds = result[indexKey] || [];
      
      if (!sessionIds.includes(sessionId)) {
        sessionIds.push(sessionId);
        
        await chrome.storage.local.set({
          [indexKey]: sessionIds
        });
      }
    } catch (error) {
      console.error('Failed to update session index:', error);
    }
  }

  async removeFromSessionIndex(sessionId) {
    const indexKey = `${this.STORAGE_KEY_PREFIX}session_index`;
    
    try {
      const result = await chrome.storage.local.get(indexKey);
      const sessionIds = result[indexKey] || [];
      
      const updatedIds = sessionIds.filter(id => id !== sessionId);
      
      await chrome.storage.local.set({
        [indexKey]: updatedIds
      });
    } catch (error) {
      console.error('Failed to remove from session index:', error);
    }
  }

  async exportSessionAsJSON(sessionId) {
    const session = await this.loadSession(sessionId);
    
    if (session) {
      const blob = new Blob([JSON.stringify(session, null, 2)], {
        type: 'application/json'
      });
      
      const url = URL.createObjectURL(blob);
      const filename = `recording_${sessionId}_${new Date().toISOString()}.json`;
      
      await chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true
      });
      
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      
      return true;
    }
    
    return false;
  }
}

export default new StorageManager();