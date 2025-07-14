// Content Script - Captures user interactions with comprehensive context
// Note: Chrome extensions don't support ES6 imports in content scripts
// We'll need to include utility functions inline or load them differently

// Recording state
let isRecording = false;
let sessionId = null;
let interactionCount = 0;
let lastInteractionTime = 0;
let pageStartTime = Date.now();

// Debounce timers
const debounceTimers = new Map();

// Event handlers map
const eventHandlers = new Map();

console.log('[WIR] Content script loaded at:', window.location.href);

// Message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('[WIR] Content script received message:', request.action);
  
  switch (request.action) {
    case 'RECORDING_STARTED':
      startRecording(request.sessionId);
      sendResponse({ status: 'started' });
      break;
      
    case 'RECORDING_STOPPED':
      stopRecording();
      sendResponse({ status: 'stopped' });
      break;
      
    case 'GET_PAGE_INFO':
      sendResponse(getPageInfo());
      break;
      
    case 'CAPTURE_FULL_PAGE':
      captureFullPage().then(data => sendResponse(data));
      return true; // Keep channel open for async response
  }
});

// Start recording
function startRecording(sid) {
  isRecording = true;
  sessionId = sid;
  interactionCount = 0;
  pageStartTime = Date.now();
  
  attachEventListeners();
  captureInitialPageState();
  
  console.log('[WIR] Recording started:', sessionId);
}

// Stop recording
function stopRecording() {
  isRecording = false;
  removeEventListeners();
  clearDebounceTimers();
  
  console.log('[WIR] Recording stopped. Total interactions:', interactionCount);
}

// Capture initial page state
async function captureInitialPageState() {
  try {
    const pageSnapshot = await capturePageSnapshot();
    
    await sendToBackground('ADD_INTERACTION', {
      type: 'page_load',
      interaction: {
        type: 'page_load',
        url: window.location.href,
        timestamp: new Date().toISOString()
      },
      element: null,
      context: {
        pageSnapshot: pageSnapshot,
        pageUrl: window.location.href,
        pageTitle: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight
        }
      },
      screenshots: {
        before: await requestScreenshot(),
        after: null
      },
      nlpDescription: `Loaded page: ${document.title}`
    });
  } catch (error) {
    console.error('[WIR] Failed to capture initial page state:', error);
  }
}

// Attach event listeners
function attachEventListeners() {
  // Mouse events
  addEventHandler('click', handleClick, true);
  addEventHandler('dblclick', handleDoubleClick, true);
  addEventHandler('contextmenu', handleRightClick, true);
  addEventHandler('mousedown', handleMouseDown, true);
  addEventHandler('mouseup', handleMouseUp, true);
  
  // Keyboard events
  addEventHandler('keydown', handleKeyDown, true);
  addEventHandler('keypress', handleKeyPress, true);
  addEventHandler('keyup', handleKeyUp, true);
  
  // Form events
  addEventHandler('input', handleInput, true);
  addEventHandler('change', handleChange, true);
  addEventHandler('submit', handleSubmit, true);
  addEventHandler('reset', handleReset, true);
  
  // Focus events
  addEventHandler('focus', handleFocus, true);
  addEventHandler('blur', handleBlur, true);
  
  // Scroll events (debounced)
  addEventHandler('scroll', handleScroll, true);
  
  // Page events
  addEventHandler('resize', handleResize, true);
  
  // Mutation observer for DOM changes
  startMutationObserver();
  
  // Shadow DOM support
  observeShadowRoots();
}

// Remove event listeners
function removeEventListeners() {
  eventHandlers.forEach((handler, eventType) => {
    document.removeEventListener(eventType, handler, true);
  });
  eventHandlers.clear();
  
  stopMutationObserver();
}

// Add event handler helper
function addEventHandler(eventType, handler, useCapture = true) {
  const wrappedHandler = (event) => {
    if (!isRecording) return;
    handler(event);
  };
  
  eventHandlers.set(eventType, wrappedHandler);
  document.addEventListener(eventType, wrappedHandler, useCapture);
}

// Main interaction capture function
async function captureInteraction(event, interactionType, additionalData = {}) {
  if (!isRecording) return;
  
  // Debounce certain events
  if (shouldDebounce(interactionType)) {
    debounceInteraction(event, interactionType, additionalData);
    return;
  }
  
  interactionCount++;
  lastInteractionTime = Date.now();
  
  try {
    const element = event.target;
    const beforeScreenshot = await requestScreenshot();
    
    // Generate selectors
    const selectors = generateAllSelectors(element);
    
    // Capture DOM context
    const domContext = captureElementWithContext(element);
    
    // Build interaction data
    const interactionData = {
      type: interactionType,
      sequenceNumber: interactionCount,
      timestamp: new Date().toISOString(),
      timeSincePageLoad: Date.now() - pageStartTime,
      interaction: {
        type: interactionType,
        ...getInteractionDetails(event, interactionType),
        ...additionalData
      },
      element: {
        selectors: selectors,
        domContext: domContext,
        ...getElementBasicInfo(element)
      },
      context: {
        pageUrl: window.location.href,
        pageTitle: document.title,
        viewport: getViewportInfo(),
        mousePosition: getMousePosition(event),
        keyboardState: getKeyboardState(event)
      },
      screenshots: {
        before: beforeScreenshot
      },
      nlpDescription: generateNLPDescription(interactionType, element, additionalData)
    };
    
    // Capture after screenshot with delay
    setTimeout(async () => {
      interactionData.screenshots.after = await requestScreenshot();
      
      // Send to background
      await sendToBackground('ADD_INTERACTION', interactionData);
    }, 300);
    
  } catch (error) {
    console.error('[WIR] Error capturing interaction:', error);
  }
}

// Selector generation functions
function generateAllSelectors(element) {
  const selectors = {};
  
  // ID selector
  if (element.id) {
    selectors.id = `#${CSS.escape(element.id)}`;
  }
  
  // Data attributes
  const testIdAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
  for (const attr of testIdAttrs) {
    const value = element.getAttribute(attr);
    if (value) {
      selectors.dataTestId = `[${attr}="${CSS.escape(value)}"]`;
      break;
    }
  }
  
  // ARIA label
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) {
    selectors.ariaLabel = `[aria-label="${CSS.escape(ariaLabel)}"]`;
  }
  
  // Name attribute
  if (element.name) {
    selectors.name = `[name="${CSS.escape(element.name)}"]`;
  }
  
  // Class selector
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c);
    if (classes.length > 0) {
      selectors.className = `.${classes.map(c => CSS.escape(c)).join('.')}`;
    }
  }
  
  // CSS Path
  selectors.cssPath = getCSSPath(element);
  
  // XPath
  selectors.xpath = getXPath(element);
  
  // Text selector
  const text = getElementText(element);
  if (text && text.length < 50) {
    selectors.text = `//${element.tagName.toLowerCase()}[normalize-space()="${text}"]`;
  }
  
  return selectors;
}

function getCSSPath(element) {
  const path = [];
  let current = element;
  
  while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName !== 'HTML') {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      path.unshift(selector);
      break;
    }
    
    // Add nth-of-type for uniqueness
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(child => child.tagName === current.tagName);
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1;
        selector += `:nth-of-type(${index})`;
      }
    }
    
    path.unshift(selector);
    current = current.parentElement;
  }
  
  return path.join(' > ');
}

function getXPath(element) {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  
  const path = [];
  let current = element;
  
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let tagName = current.tagName.toLowerCase();
    let index = 1;
    
    if (current.parentNode) {
      const siblings = Array.from(current.parentNode.childNodes)
        .filter(node => node.nodeType === Node.ELEMENT_NODE && node.tagName === current.tagName);
      
      if (siblings.length > 1) {
        index = siblings.indexOf(current) + 1;
      }
    }
    
    const step = siblings.length > 1 ? `${tagName}[${index}]` : tagName;
    path.unshift(step);
    
    if (current.parentElement) {
      current = current.parentElement;
    } else {
      break;
    }
  }
  
  return `//${path.join('/')}`;
}

// DOM capture functions
function captureElementWithContext(element) {
  return {
    element: captureElementDetails(element),
    parents: captureParents(element, 3),
    siblings: captureSiblings(element, 5),
    boundingBox: getBoundingBox(element),
    computedStyles: captureComputedStyles(element)
  };
}

function captureElementDetails(element) {
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    className: element.className || null,
    attributes: captureAttributes(element),
    innerText: getElementText(element),
    innerHTML: element.innerHTML ? element.innerHTML.substring(0, 1000) : '',
    outerHTML: element.outerHTML ? element.outerHTML.substring(0, 2000) : '',
    value: getElementValue(element),
    isVisible: isElementVisible(element),
    isInteractive: isElementInteractive(element),
    role: element.getAttribute('role') || getImplicitRole(element),
    ariaAttributes: captureAriaAttributes(element)
  };
}

function captureParents(element, maxLevels) {
  const parents = [];
  let current = element.parentElement;
  let level = 0;
  
  while (current && level < maxLevels && current.tagName !== 'HTML') {
    parents.push({
      level: level + 1,
      tagName: current.tagName.toLowerCase(),
      id: current.id || null,
      className: current.className || null,
      role: current.getAttribute('role') || null
    });
    
    current = current.parentElement;
    level++;
  }
  
  return parents;
}

function captureSiblings(element, maxCount) {
  const siblings = [];
  const parent = element.parentElement;
  
  if (!parent) return siblings;
  
  const allSiblings = Array.from(parent.children);
  const elementIndex = allSiblings.indexOf(element);
  
  // Get siblings before and after
  const startIndex = Math.max(0, elementIndex - Math.floor(maxCount / 2));
  const endIndex = Math.min(allSiblings.length, elementIndex + Math.ceil(maxCount / 2) + 1);
  
  for (let i = startIndex; i < endIndex; i++) {
    if (i !== elementIndex) {
      const sibling = allSiblings[i];
      siblings.push({
        position: i < elementIndex ? 'before' : 'after',
        distance: Math.abs(i - elementIndex),
        tagName: sibling.tagName.toLowerCase(),
        id: sibling.id || null,
        className: sibling.className || null,
        innerText: getElementText(sibling).substring(0, 50)
      });
    }
  }
  
  return siblings;
}

function captureAttributes(element) {
  const attributes = {};
  for (const attr of element.attributes) {
    attributes[attr.name] = attr.value;
  }
  return attributes;
}

function captureAriaAttributes(element) {
  const ariaAttrs = {};
  for (const attr of element.attributes) {
    if (attr.name.startsWith('aria-')) {
      ariaAttrs[attr.name] = attr.value;
    }
  }
  return ariaAttrs;
}

function captureComputedStyles(element) {
  const styles = window.getComputedStyle(element);
  return {
    display: styles.display,
    visibility: styles.visibility,
    opacity: styles.opacity,
    position: styles.position,
    width: styles.width,
    height: styles.height,
    top: styles.top,
    left: styles.left,
    color: styles.color,
    backgroundColor: styles.backgroundColor,
    fontSize: styles.fontSize,
    fontWeight: styles.fontWeight,
    cursor: styles.cursor,
    zIndex: styles.zIndex
  };
}

function getBoundingBox(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: Math.round(rect.x),
    y: Math.round(rect.y),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    left: Math.round(rect.left),
    centerX: Math.round(rect.x + rect.width / 2),
    centerY: Math.round(rect.y + rect.height / 2)
  };
}

function capturePageSnapshot() {
  return {
    html: document.documentElement.outerHTML.substring(0, 50000),
    url: window.location.href,
    title: document.title,
    metadata: {
      viewport: getViewportInfo(),
      documentSize: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight
      },
      timestamp: new Date().toISOString()
    }
  };
}

// Helper functions
function isElementVisible(element) {
  const rect = element.getBoundingClientRect();
  const style = window.getComputedStyle(element);
  
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  );
}

function isElementInteractive(element) {
  const interactiveTags = ['a', 'button', 'input', 'select', 'textarea'];
  const interactiveRoles = ['button', 'link', 'checkbox', 'radio', 'textbox'];
  
  return (
    interactiveTags.includes(element.tagName.toLowerCase()) ||
    interactiveRoles.includes(element.getAttribute('role')) ||
    element.hasAttribute('onclick') ||
    element.hasAttribute('tabindex') ||
    window.getComputedStyle(element).cursor === 'pointer'
  );
}

function getImplicitRole(element) {
  const tagRoles = {
    'a': 'link',
    'button': 'button',
    'input': getInputRole(element),
    'select': 'combobox',
    'textarea': 'textbox',
    'img': 'img',
    'nav': 'navigation',
    'main': 'main',
    'header': 'banner',
    'footer': 'contentinfo',
    'aside': 'complementary'
  };
  
  return tagRoles[element.tagName.toLowerCase()] || null;
}

function getInputRole(input) {
  const type = input.type || 'text';
  const typeRoles = {
    'button': 'button',
    'checkbox': 'checkbox',
    'radio': 'radio',
    'search': 'searchbox',
    'submit': 'button',
    'reset': 'button'
  };
  
  return typeRoles[type] || 'textbox';
}

// Get interaction-specific details
function getInteractionDetails(event, interactionType) {
  const details = {};
  
  // Mouse events
  if (event instanceof MouseEvent) {
    details.coordinates = {
      page: { x: event.pageX, y: event.pageY },
      client: { x: event.clientX, y: event.clientY },
      screen: { x: event.screenX, y: event.screenY }
    };
    details.button = event.button;
    details.buttons = event.buttons;
  }
  
  // Keyboard events
  if (event instanceof KeyboardEvent) {
    details.key = event.key;
    details.code = event.code;
    details.keyCode = event.keyCode;
    details.modifiers = {
      ctrl: event.ctrlKey,
      shift: event.shiftKey,
      alt: event.altKey,
      meta: event.metaKey
    };
  }
  
  // Input events
  if (event.target && 'value' in event.target) {
    details.value = event.target.value;
    details.previousValue = event.target.getAttribute('data-wir-previous-value') || '';
    
    // Store current value for next time
    event.target.setAttribute('data-wir-previous-value', event.target.value);
  }
  
  // Form events
  if (event.target && event.target.form) {
    details.formId = event.target.form.id || null;
    details.formAction = event.target.form.action || null;
  }
  
  return details;
}

// Get basic element information
function getElementBasicInfo(element) {
  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    className: element.className || null,
    name: element.name || null,
    type: element.type || null,
    href: element.href || null,
    src: element.src || null,
    text: getElementText(element),
    value: getElementValue(element),
    checked: element.checked !== undefined ? element.checked : null,
    disabled: element.disabled !== undefined ? element.disabled : null,
    readOnly: element.readOnly !== undefined ? element.readOnly : null
  };
}

// Get element text content
function getElementText(element) {
  // Priority order for text
  const text = element.getAttribute('aria-label') ||
               element.innerText?.trim() ||
               element.textContent?.trim() ||
               element.getAttribute('placeholder') ||
               element.getAttribute('title') ||
               element.getAttribute('alt') ||
               '';
               
  return text.substring(0, 200); // Limit length
}

// Get element value safely
function getElementValue(element) {
  if (!('value' in element)) return null;
  
  const type = element.type || element.getAttribute('type');
  if (type === 'password') return '***';
  
  return element.value;
}

// Generate NLP description
function generateNLPDescription(interactionType, element, additionalData) {
  const elementText = getElementText(element);
  const elementType = element.tagName.toLowerCase();
  const elementRole = element.getAttribute('role') || elementType;
  
  let description = '';
  
  switch (interactionType) {
    case 'click':
      description = `Clicked on ${elementRole}`;
      if (elementText) description += ` "${elementText.substring(0, 50)}"`;
      break;
      
    case 'input':
      description = `Typed in ${elementRole} field`;
      if (element.getAttribute('placeholder')) {
        description += ` (${element.getAttribute('placeholder')})`;
      }
      break;
      
    case 'change':
      description = `Changed ${elementRole}`;
      if (additionalData.value) description += ` to "${additionalData.value}"`;
      break;
      
    case 'submit':
      description = 'Submitted form';
      if (element.form?.id) description += ` #${element.form.id}`;
      break;
      
    case 'scroll':
      description = `Scrolled ${additionalData.direction || 'page'}`;
      break;
      
    default:
      description = `${interactionType} on ${elementRole}`;
  }
  
  return description;
}

// Event Handlers
function handleClick(event) {
  captureInteraction(event, 'click', {
    mouseButton: 'left'
  });
}

function handleDoubleClick(event) {
  captureInteraction(event, 'dblclick', {
    mouseButton: 'left',
    clickCount: 2
  });
}

function handleRightClick(event) {
  captureInteraction(event, 'contextmenu', {
    mouseButton: 'right'
  });
}

function handleMouseDown(event) {
  // Only capture for drag operations
  event.target.setAttribute('data-wir-mouse-down', Date.now());
}

function handleMouseUp(event) {
  const mouseDownTime = event.target.getAttribute('data-wir-mouse-down');
  if (mouseDownTime) {
    const duration = Date.now() - parseInt(mouseDownTime);
    if (duration > 500) { // Likely a drag
      captureInteraction(event, 'drag', {
        duration: duration
      });
    }
    event.target.removeAttribute('data-wir-mouse-down');
  }
}

function handleKeyDown(event) {
  // Only capture important keys
  const importantKeys = ['Enter', 'Tab', 'Escape', 'Backspace', 'Delete'];
  const isModifier = event.ctrlKey || event.metaKey || event.altKey;
  
  if (importantKeys.includes(event.key) || isModifier || event.key.length === 1) {
    captureInteraction(event, 'keydown', {
      key: event.key,
      code: event.code
    });
  }
}

function handleKeyPress(event) {
  // Deprecated but still capture for compatibility
  if (event.key.length === 1) {
    captureInteraction(event, 'keypress', {
      key: event.key,
      charCode: event.charCode
    });
  }
}

function handleKeyUp(event) {
  // Only for special keys
  if (event.key === 'Enter' || event.key === 'Tab') {
    captureInteraction(event, 'keyup', {
      key: event.key
    });
  }
}

function handleInput(event) {
  captureInteraction(event, 'input', {
    inputType: event.inputType || 'insertText',
    data: event.data
  });
}

function handleChange(event) {
  captureInteraction(event, 'change', {
    value: getElementValue(event.target),
    checked: event.target.checked
  });
}

function handleSubmit(event) {
  event.preventDefault(); // Prevent actual submission during recording
  
  captureInteraction(event, 'submit', {
    formData: serializeForm(event.target)
  });
  
  // Allow submission after capture
  setTimeout(() => {
    if (confirm('Form captured. Submit for real?')) {
      event.target.submit();
    }
  }, 100);
}

function handleReset(event) {
  captureInteraction(event, 'reset');
}

function handleFocus(event) {
  captureInteraction(event, 'focus');
}

function handleBlur(event) {
  captureInteraction(event, 'blur');
}

function handleScroll(event) {
  const target = event.target === document ? window : event.target;
  const scrollData = {
    scrollTop: target.scrollY || target.scrollTop || 0,
    scrollLeft: target.scrollX || target.scrollLeft || 0,
    scrollHeight: target.scrollHeight || document.documentElement.scrollHeight,
    scrollWidth: target.scrollWidth || document.documentElement.scrollWidth,
    direction: getScrollDirection(event)
  };
  
  captureInteraction(event, 'scroll', scrollData);
}

function handleResize(event) {
  captureInteraction(event, 'resize', {
    width: window.innerWidth,
    height: window.innerHeight
  });
}

// Utility functions
function shouldDebounce(interactionType) {
  return ['scroll', 'resize', 'input'].includes(interactionType);
}

function debounceInteraction(event, interactionType, additionalData, delay = 300) {
  const key = `${interactionType}_${event.target}`;
  
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key));
  }
  
  const timer = setTimeout(() => {
    captureInteraction(event, interactionType, additionalData);
    debounceTimers.delete(key);
  }, delay);
  
  debounceTimers.set(key, timer);
}

function clearDebounceTimers() {
  debounceTimers.forEach(timer => clearTimeout(timer));
  debounceTimers.clear();
}

function getViewportInfo() {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    devicePixelRatio: window.devicePixelRatio
  };
}

function getMousePosition(event) {
  if (!(event instanceof MouseEvent)) return null;
  
  return {
    page: { x: event.pageX, y: event.pageY },
    client: { x: event.clientX, y: event.clientY },
    screen: { x: event.screenX, y: event.screenY }
  };
}

function getKeyboardState(event) {
  if (!(event instanceof KeyboardEvent)) return null;
  
  return {
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey
  };
}

function getScrollDirection(event) {
  const target = event.target === document ? window : event.target;
  const currentScroll = {
    x: target.scrollX || target.scrollLeft || 0,
    y: target.scrollY || target.scrollTop || 0
  };
  
  const lastScroll = target.getAttribute('data-wir-last-scroll');
  if (lastScroll) {
    const last = JSON.parse(lastScroll);
    if (currentScroll.y > last.y) return 'down';
    if (currentScroll.y < last.y) return 'up';
    if (currentScroll.x > last.x) return 'right';
    if (currentScroll.x < last.x) return 'left';
  }
  
  target.setAttribute('data-wir-last-scroll', JSON.stringify(currentScroll));
  return 'unknown';
}

function serializeForm(form) {
  const data = {};
  const formData = new FormData(form);
  
  for (const [key, value] of formData.entries()) {
    // Mask sensitive fields
    if (key.toLowerCase().includes('password') || 
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('secret')) {
      data[key] = '***';
    } else {
      data[key] = value;
    }
  }
  
  return data;
}

async function requestScreenshot() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: 'CAPTURE_SCREENSHOT' },
      response => {
        resolve(response?.screenshot || null);
      }
    );
  });
}

async function sendToBackground(action, data) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { action, data },
      response => {
        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      }
    );
  });
}

function getPageInfo() {
  return {
    url: window.location.href,
    title: document.title,
    readyState: document.readyState,
    isRecording: isRecording,
    interactionCount: interactionCount
  };
}

async function captureFullPage() {
  return capturePageSnapshot();
}

// Mutation Observer for DOM changes
let mutationObserver = null;

function startMutationObserver() {
  mutationObserver = new MutationObserver((mutations) => {
    if (!isRecording) return;
    
    // Batch mutations
    const significantChange = mutations.some(mutation => {
      return mutation.type === 'childList' && 
             (mutation.addedNodes.length > 5 || mutation.removedNodes.length > 5);
    });
    
    if (significantChange) {
      console.log('[WIR] Significant DOM change detected');
      // Could capture DOM change as an interaction
    }
  });
  
  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'hidden', 'disabled']
  });
}

function stopMutationObserver() {
  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
}

// Shadow DOM support
function observeShadowRoots() {
  // Find all elements with shadow roots
  const elementsWithShadow = document.querySelectorAll('*');
  
  elementsWithShadow.forEach(element => {
    if (element.shadowRoot) {
      // Attach listeners to shadow root
      attachShadowListeners(element.shadowRoot);
    }
  });
}

function attachShadowListeners(shadowRoot) {
  // Add event listeners to shadow DOM
  ['click', 'input', 'change'].forEach(eventType => {
    shadowRoot.addEventListener(eventType, (event) => {
      if (!isRecording) return;
      
      // Handle shadow DOM events
      console.log('[WIR] Shadow DOM event:', eventType);
      captureInteraction(event, eventType, {
        inShadowDOM: true
      });
    }, true);
  });
}

// Initialize
console.log('[WIR] Content script ready');