// Screenshot Capture Utilities
class ScreenshotCapture {
  constructor() {
    this.captureQueue = [];
    this.isProcessing = false;
    this.maxRetries = 3;
    this.retryDelay = 100;
  }

  // Capture screenshot with retry logic
  async capture(tabId = null, options = {}) {
    const defaultOptions = {
      format: 'png',
      quality: 80,
      fullPage: false
    };
    
    const captureOptions = { ...defaultOptions, ...options };
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Ensure tab is active if specified
        if (tabId) {
          await this.ensureTabActive(tabId);
        }
        
        // Capture visible tab
        const screenshot = await chrome.tabs.captureVisibleTab(null, {
          format: captureOptions.format,
          quality: captureOptions.quality
        });
        
        // Process screenshot if needed
        const processed = await this.processScreenshot(screenshot, captureOptions);
        
        return processed;
      } catch (error) {
        console.error(`Screenshot capture attempt ${attempt} failed:`, error);
        
        if (attempt === this.maxRetries) {
          return this.getErrorPlaceholder(error);
        }
        
        // Wait before retry
        await this.delay(this.retryDelay * attempt);
      }
    }
  }

  // Capture with highlight on element
  async captureWithHighlight(tabId, elementSelector, options = {}) {
    try {
      // Inject highlight
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: this.highlightElement,
        args: [elementSelector]
      });
      
      // Wait for highlight to render
      await this.delay(50);
      
      // Capture screenshot
      const screenshot = await this.capture(tabId, options);
      
      // Remove highlight
      await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: this.removeHighlight
      });
      
      return screenshot;
    } catch (error) {
      console.error('Failed to capture with highlight:', error);
      return this.capture(tabId, options);
    }
  }

  // Capture viewport info along with screenshot
  async captureWithViewport(tabId) {
    try {
      const [viewport] = await chrome.scripting.executeScript({
        target: { tabId: tabId },
        func: () => ({
          width: window.innerWidth,
          height: window.innerHeight,
          scrollX: window.scrollX,
          scrollY: window.scrollY,
          devicePixelRatio: window.devicePixelRatio,
          documentHeight: document.documentElement.scrollHeight,
          documentWidth: document.documentElement.scrollWidth
        })
      });
      
      const screenshot = await this.capture(tabId);
      
      return {
        screenshot,
        viewport: viewport.result
      };
    } catch (error) {
      console.error('Failed to capture with viewport:', error);
      return {
        screenshot: await this.capture(tabId),
        viewport: null
      };
    }
  }

  // Queue screenshot capture for performance
  async queueCapture(tabId, callback) {
    return new Promise((resolve, reject) => {
      this.captureQueue.push({
        tabId,
        callback,
        resolve,
        reject,
        timestamp: Date.now()
      });
      
      this.processQueue();
    });
  }

  // Process queued captures
  async processQueue() {
    if (this.isProcessing || this.captureQueue.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    while (this.captureQueue.length > 0) {
      const task = this.captureQueue.shift();
      
      try {
        const screenshot = await this.capture(task.tabId);
        if (task.callback) {
          task.callback(screenshot);
        }
        task.resolve(screenshot);
      } catch (error) {
        task.reject(error);
      }
      
      // Small delay between captures
      if (this.captureQueue.length > 0) {
        await this.delay(50);
      }
    }
    
    this.isProcessing = false;
  }

  // Process screenshot (compress, resize, etc.)
  async processScreenshot(screenshot, options) {
    // If full page is requested, this would need page scrolling logic
    if (options.fullPage) {
      console.warn('Full page screenshots not yet implemented');
    }
    
    // Check size and compress if needed
    const sizeInBytes = this.getBase64Size(screenshot);
    
    if (sizeInBytes > 500000 && options.quality > 50) { // 500KB
      console.log(`Screenshot too large (${sizeInBytes} bytes), attempting compression`);
      return this.compressImage(screenshot, options.quality - 20);
    }
    
    return screenshot;
  }

  // Compress image by reducing quality
  async compressImage(base64Image, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        
        // Convert to lower quality
        const compressed = canvas.toDataURL('image/jpeg', quality / 100);
        resolve(compressed);
      };
      
      img.onerror = () => {
        console.error('Failed to compress image');
        resolve(base64Image); // Return original on error
      };
      
      img.src = base64Image;
    });
  }

  // Ensure tab is active before capture
  async ensureTabActive(tabId) {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (activeTab.id !== tabId) {
        await chrome.tabs.update(tabId, { active: true });
        await this.delay(100); // Wait for tab to become active
      }
    } catch (error) {
      console.error('Failed to activate tab:', error);
    }
  }

  // Get base64 size in bytes
  getBase64Size(base64String) {
    const base64 = base64String.split(',')[1] || base64String;
    const padding = (base64.match(/=/g) || []).length;
    return Math.floor(base64.length * 0.75) - padding;
  }

  // Get error placeholder image
  getErrorPlaceholder(error) {
    // Return a small 1x1 transparent PNG as placeholder
    return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  }

  // Highlight element function (injected into page)
  highlightElement(selector) {
    try {
      const element = document.querySelector(selector);
      if (element) {
        element.setAttribute('data-wir-highlight', 'true');
        element.style.outline = '3px solid #ff0000';
        element.style.outlineOffset = '2px';
      }
    } catch (e) {
      console.error('Failed to highlight element:', e);
    }
  }

  // Remove highlight function (injected into page)
  removeHighlight() {
    try {
      const highlighted = document.querySelector('[data-wir-highlight]');
      if (highlighted) {
        highlighted.style.outline = '';
        highlighted.style.outlineOffset = '';
        highlighted.removeAttribute('data-wir-highlight');
      }
    } catch (e) {
      console.error('Failed to remove highlight:', e);
    }
  }

  // Utility delay function
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Capture multiple screenshots with delay
  async captureSequence(tabId, count = 3, delayMs = 100) {
    const screenshots = [];
    
    for (let i = 0; i < count; i++) {
      if (i > 0) {
        await this.delay(delayMs);
      }
      
      const screenshot = await this.capture(tabId);
      screenshots.push({
        index: i,
        timestamp: Date.now(),
        screenshot
      });
    }
    
    return screenshots;
  }

  // Compare two screenshots for changes
  async compareScreenshots(screenshot1, screenshot2) {
    // Basic comparison by size
    const size1 = this.getBase64Size(screenshot1);
    const size2 = this.getBase64Size(screenshot2);
    
    const sizeDiff = Math.abs(size1 - size2);
    const percentChange = (sizeDiff / size1) * 100;
    
    return {
      changed: percentChange > 5, // More than 5% size difference
      sizeDiff,
      percentChange
    };
  }
}

// Export singleton instance
const screenshotCapture = new ScreenshotCapture();

// Also export the class for testing
export { ScreenshotCapture };
export default screenshotCapture;