// DOM Capture Utilities
class DOMCapture {
  constructor() {
    this.maxDepth = 5;
    this.maxSiblings = 10;
    this.maxHtmlLength = 50000;
  }

  // Capture full page snapshot
  async capturePageSnapshot() {
    try {
      return {
        html: this.sanitizeHTML(document.documentElement.outerHTML),
        url: window.location.href,
        title: document.title,
        metadata: {
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            scrollX: window.scrollX,
            scrollY: window.scrollY
          },
          documentSize: {
            width: document.documentElement.scrollWidth,
            height: document.documentElement.scrollHeight
          },
          timestamp: new Date().toISOString()
        },
        styles: this.captureStylesheets(),
        scripts: this.captureScripts()
      };
    } catch (error) {
      console.error('Failed to capture page snapshot:', error);
      return null;
    }
  }

  // Capture element with full context
  captureElementWithContext(element, options = {}) {
    const defaultOptions = {
      includeParents: true,
      includeSiblings: true,
      includeChildren: true,
      maxParentLevels: 3,
      maxSiblingCount: 5,
      includeStyles: true,
      includeBoundingBox: true
    };
    
    const opts = { ...defaultOptions, ...options };
    
    return {
      element: this.captureElement(element, opts),
      parents: opts.includeParents ? this.captureParents(element, opts.maxParentLevels) : [],
      siblings: opts.includeSiblings ? this.captureSiblings(element, opts.maxSiblingCount) : [],
      children: opts.includeChildren ? this.captureChildren(element) : [],
      boundingBox: opts.includeBoundingBox ? this.getBoundingBox(element) : null,
      computedStyles: opts.includeStyles ? this.captureComputedStyles(element) : null
    };
  }

  // Capture single element details
  captureElement(element, options = {}) {
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      className: element.className || null,
      attributes: this.captureAttributes(element),
      innerText: this.getInnerText(element),
      innerHTML: this.sanitizeHTML(element.innerHTML, 1000),
      outerHTML: this.sanitizeHTML(element.outerHTML, 2000),
      value: this.getElementValue(element),
      isVisible: this.isElementVisible(element),
      isInteractive: this.isElementInteractive(element),
      role: element.getAttribute('role') || this.getImplicitRole(element),
      ariaAttributes: this.captureAriaAttributes(element)
    };
  }

  // Capture parent elements
  captureParents(element, maxLevels) {
    const parents = [];
    let current = element.parentElement;
    let level = 0;
    
    while (current && level < maxLevels && current.tagName !== 'HTML') {
      parents.push({
        level: level + 1,
        tagName: current.tagName.toLowerCase(),
        id: current.id || null,
        className: current.className || null,
        role: current.getAttribute('role') || null,
        attributes: this.captureAttributes(current, ['id', 'class', 'role', 'data-testid'])
      });
      
      current = current.parentElement;
      level++;
    }
    
    return parents;
  }

  // Capture sibling elements
  captureSiblings(element, maxCount) {
    const siblings = [];
    const parent = element.parentElement;
    
    if (!parent) return siblings;
    
    const allSiblings = Array.from(parent.children);
    const elementIndex = allSiblings.indexOf(element);
    
    // Get siblings before
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
          innerText: this.getInnerText(sibling, 50),
          attributes: this.captureAttributes(sibling, ['id', 'class', 'role'])
        });
      }
    }
    
    return siblings;
  }

  // Capture child elements
  captureChildren(element, maxDepth = 2) {
    const captureChildrenRecursive = (el, currentDepth) => {
      if (currentDepth >= maxDepth || !el.children || el.children.length === 0) {
        return [];
      }
      
      return Array.from(el.children).map(child => ({
        tagName: child.tagName.toLowerCase(),
        id: child.id || null,
        className: child.className || null,
        innerText: this.getInnerText(child, 50),
        childCount: child.children.length,
        children: captureChildrenRecursive(child, currentDepth + 1)
      }));
    };
    
    return captureChildrenRecursive(element, 0);
  }

  // Capture all attributes
  captureAttributes(element, filterList = null) {
    const attributes = {};
    
    for (const attr of element.attributes) {
      if (!filterList || filterList.includes(attr.name)) {
        attributes[attr.name] = attr.value;
      }
    }
    
    return attributes;
  }

  // Capture ARIA attributes
  captureAriaAttributes(element) {
    const ariaAttrs = {};
    
    for (const attr of element.attributes) {
      if (attr.name.startsWith('aria-')) {
        ariaAttrs[attr.name] = attr.value;
      }
    }
    
    return ariaAttrs;
  }

  // Capture computed styles
  captureComputedStyles(element) {
    const styles = window.getComputedStyle(element);
    const important = [
      'display', 'visibility', 'opacity', 'position',
      'width', 'height', 'top', 'left', 'right', 'bottom',
      'margin', 'padding', 'border', 'background',
      'color', 'font-size', 'font-weight', 'text-align',
      'z-index', 'overflow', 'cursor', 'pointer-events'
    ];
    
    const captured = {};
    
    for (const prop of important) {
      const value = styles.getPropertyValue(prop);
      if (value && value !== 'none' && value !== 'normal' && value !== 'auto') {
        captured[prop] = value;
      }
    }
    
    return captured;
  }

  // Get bounding box with viewport info
  getBoundingBox(element) {
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
      inViewport: this.isInViewport(rect),
      centerX: Math.round(rect.x + rect.width / 2),
      centerY: Math.round(rect.y + rect.height / 2)
    };
  }

  // Capture stylesheets
  captureStylesheets() {
    const styles = [];
    
    try {
      for (const sheet of document.styleSheets) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (rules) {
            styles.push({
              href: sheet.href,
              media: sheet.media.mediaText,
              ruleCount: rules.length
            });
          }
        } catch (e) {
          // Cross-origin stylesheets will throw
          styles.push({
            href: sheet.href,
            media: sheet.media.mediaText,
            error: 'Cross-origin'
          });
        }
      }
    } catch (error) {
      console.error('Failed to capture stylesheets:', error);
    }
    
    return styles;
  }

  // Capture scripts
  captureScripts() {
    const scripts = [];
    
    try {
      document.querySelectorAll('script').forEach(script => {
        scripts.push({
          src: script.src || null,
          type: script.type || 'text/javascript',
          async: script.async,
          defer: script.defer,
          inline: !script.src
        });
      });
    } catch (error) {
      console.error('Failed to capture scripts:', error);
    }
    
    return scripts;
  }

  // Helper methods
  sanitizeHTML(html, maxLength = null) {
    if (!html) return '';
    
    // Remove sensitive data patterns
    let sanitized = html
      .replace(/password="[^"]*"/gi, 'password="***"')
      .replace(/token="[^"]*"/gi, 'token="***"')
      .replace(/api[_-]?key="[^"]*"/gi, 'api_key="***"');
    
    if (maxLength && sanitized.length > maxLength) {
      sanitized = sanitized.substring(0, maxLength) + '...';
    }
    
    return sanitized;
  }

  getInnerText(element, maxLength = 200) {
    const text = element.innerText || element.textContent || '';
    const trimmed = text.trim();
    
    if (maxLength && trimmed.length > maxLength) {
      return trimmed.substring(0, maxLength) + '...';
    }
    
    return trimmed;
  }

  getElementValue(element) {
    if (element.value !== undefined) {
      // Mask sensitive inputs
      const type = element.type || element.getAttribute('type');
      if (type === 'password') {
        return '***';
      }
      return element.value;
    }
    
    if (element.hasAttribute('contenteditable')) {
      return element.textContent;
    }
    
    return null;
  }

  isElementVisible(element) {
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

  isElementInteractive(element) {
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

  isInViewport(rect) {
    return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= window.innerHeight &&
      rect.right <= window.innerWidth
    );
  }

  getImplicitRole(element) {
    const tagRoles = {
      'a': 'link',
      'button': 'button',
      'input': this.getInputRole(element),
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

  getInputRole(input) {
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
}

// Export singleton instance
const domCapture = new DOMCapture();

// Also export the class for testing
export { DOMCapture };
export default domCapture;