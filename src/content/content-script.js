(function() {
if (window.wirLoaded) return;  // Prevent multiple injections
window.wirLoaded = true;

let recording = false;
let sequenceNumber = 0;

async function captureScreenshot() {
  try {
    return await new Promise((resolve) => {
      chrome.runtime.sendMessage({type: 'captureScreenshot'}, (response) => {
        if (chrome.runtime.lastError) {
          console.error('Screenshot error:', chrome.runtime.lastError);
          resolve(null);
        } else {
          resolve(response.screenshot || null);
        }
      });
    });
  } catch (err) {
    console.error('Screenshot failed:', err);
    return null;
  }
}

function generateNLP(event, element) {
  // Simple NLP; expand with more logic or library if needed
  return `${event.type} on ${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ''}`;
}

function getCSSPath(el) {
  let path = '';
  while (el.nodeName !== 'HTML') {
    let name = el.nodeName.toLowerCase();
    if (el.id) name += `#${el.id}`;
    else if (el.className) name += `.${el.className.trim().replace(/\s/g, '.')}`;
    path = name + ' > ' + path;
    el = el.parentNode;
  }
  return path.slice(0, -3);
}

function getXPath(el) {
  let path = '';
  while (el && el.nodeType === 1) {
    let index = 0;
    let sib = el.previousSibling;
    while (sib) {
      if (sib.nodeType === 1 && sib.tagName === el.tagName) index++;
      sib = sib.previousSibling;
    }
    path = `/${el.tagName.toLowerCase()}[${index + 1}]${path}`;
    el = el.parentNode;
  }
  return path;
}

function generateAllSelectors(element) {
  const selectors = {};
  if (element.id) selectors.id = `#${element.id}`;
  selectors.css = getCSSPath(element);
  selectors.xpath = getXPath(element);
  selectors.text = `${element.tagName.toLowerCase()}:contains('${element.textContent.trim().slice(0,20)}')`;
  // Add data-qa or other
  return selectors;
}

function getElementDetails(element) {
  return {
    tagName: element.tagName,
    html: element.outerHTML ? element.outerHTML.slice(0, 500) : '',
    attributes: Array.from(element.attributes || []).reduce((acc, attr) => ({...acc, [attr.name]: attr.value}), {}),
    computedStyles: (() => { try { return window.getComputedStyle(element); } catch { return {}; } })(),
    selectors: generateAllSelectors(element)
  };
}

function getSiblings(element) {
  const siblings = [];
  let sib = element.parentNode ? element.parentNode.firstChild : null;
  while (sib) {
    if (sib.nodeType === 1 && sib !== element) {
      siblings.push(getElementDetails(sib));
      if (siblings.length >= 5) break;  // Limit to 5
    }
    sib = sib.nextSibling;
  }
  return siblings;
}

function getParents(element, levels = 3) {
  const parents = [];
  let parent = element.parentNode;
  for (let i = 0; i < levels && parent;) {
    if (parent && parent.nodeType === 1) {
      parents.push(getElementDetails(parent));
      i++;
    }
    parent = parent.parentNode;
  }
  return parents;
}

function getFormDetails(form) {
  if (!form) return null;
  const inputs = Array.from(form.querySelectorAll('input, select, textarea')).map(input => ({
    name: input.name,
    type: input.type,
    value: input.type === 'password' ? '***' : input.value  // Mask sensitive
  }));
  return {inputs};
}

function getContextDetails(element) {
  return {
    url: window.location.href,
    pageTitle: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      scrollX: window.scrollX,
      scrollY: window.scrollY,
      devicePixelRatio: window.devicePixelRatio
    },
    parentElements: getParents(element, 3),
    siblings: getSiblings(element),
    formContext: element.closest('form') ? getFormDetails(element.closest('form')) : null,
    fullDOM: document.documentElement.outerHTML.slice(0, 10000)  // Truncated
  };
}

function getInteractionDetails(event) {
  return {
    type: event.type,
    coordinates: event.clientX ? {x: event.clientX, y: event.clientY} : null,
    key: event.key || null
  };
}

async function captureInteraction(event) {
  if (!recording) return;
  const target = event.target;
  let beforeScreenshot = null;
  let afterScreenshot = null;
  try {
    beforeScreenshot = await captureScreenshot();
    await new Promise(resolve => setTimeout(resolve, 100));  // Wait for DOM change
    afterScreenshot = await captureScreenshot();
    const data = {
      sequenceNumber: ++sequenceNumber,
      timestamp: new Date().toISOString(),
      timeSincePageLoad: performance.now(),
      interaction: getInteractionDetails(event),
      element: getElementDetails(target),
      context: getContextDetails(target),
      screenshots: { before: beforeScreenshot, after: afterScreenshot },
      nlpDescription: generateNLP(event, target)
    };
    chrome.runtime.sendMessage({type: 'addInteraction', data});
  } catch (err) {
    console.error('Interaction capture error:', err);
    // Send partial data if possible
    chrome.runtime.sendMessage({type: 'addInteraction', data: {error: err.message, partial: true}});
  }
}

async function capturePageState(type) {
  try {
    const data = {
      sequenceNumber: type === 'start' ? 0 : sequenceNumber + 1,
      timestamp: new Date().toISOString(),
      type: `${type}State`,
      context: getContextDetails(document.documentElement),
      screenshots: { before: await captureScreenshot(), after: null },
      nlpDescription: `${type} page state`
    };
    chrome.runtime.sendMessage({type: 'addInteraction', data});
  } catch (err) {
    console.error(`${type} state capture error:`, err);
  }
}

// Event listeners with capture: true for bubbling, composed: true for shadow DOM
const events = ['click', 'dblclick', 'contextmenu', 'keydown', 'input', 'change', 'submit', 'scroll', 'focus', 'blur'];
events.forEach(eventType => {
  document.addEventListener(eventType, (e) => {
    if (e.isTrusted) {  // Filter user-initiated only
      captureInteraction(e);
    }
  }, {capture: true, passive: true, composed: true});
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type === 'start') {
    recording = true;
    capturePageState('start');
  } else if (message.type === 'stop') {
    capturePageState('stop');
    recording = false;
  }
});
})();