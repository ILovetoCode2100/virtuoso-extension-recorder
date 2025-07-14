// Selector Generation Utilities
class SelectorGenerator {
  constructor() {
    this.selectorStrategies = [
      'id',
      'dataTestId',
      'ariaLabel',
      'uniqueClass',
      'cssPath',
      'xpath',
      'text'
    ];
  }

  // Generate all possible selectors for an element
  generateAllSelectors(element) {
    const selectors = {
      id: this.getIdSelector(element),
      dataTestId: this.getDataTestIdSelector(element),
      ariaLabel: this.getAriaLabelSelector(element),
      name: this.getNameSelector(element),
      className: this.getClassSelector(element),
      cssPath: this.getCSSPath(element),
      optimizedCss: this.getOptimizedCSSPath(element),
      xpath: this.getXPath(element),
      absoluteXpath: this.getAbsoluteXPath(element),
      text: this.getTextSelector(element),
      linkText: this.getLinkTextSelector(element),
      partialLinkText: this.getPartialLinkTextSelector(element),
      tagName: element.tagName.toLowerCase(),
      attributes: this.getAttributeSelectors(element),
      position: this.getPositionSelector(element),
      shadowPath: this.getShadowDOMPath(element)
    };

    // Filter out null/undefined selectors
    return Object.entries(selectors).reduce((acc, [key, value]) => {
      if (value) acc[key] = value;
      return acc;
    }, {});
  }

  // Get best selector based on priority
  getBestSelector(element) {
    const selectors = this.generateAllSelectors(element);
    
    // Priority order
    if (selectors.id) return { type: 'id', value: selectors.id };
    if (selectors.dataTestId) return { type: 'dataTestId', value: selectors.dataTestId };
    if (selectors.ariaLabel) return { type: 'ariaLabel', value: selectors.ariaLabel };
    if (selectors.name) return { type: 'name', value: selectors.name };
    if (selectors.optimizedCss) return { type: 'css', value: selectors.optimizedCss };
    if (selectors.xpath) return { type: 'xpath', value: selectors.xpath };
    
    return { type: 'css', value: selectors.cssPath };
  }

  getIdSelector(element) {
    if (element.id && this.isValidId(element.id)) {
      return `#${CSS.escape(element.id)}`;
    }
    return null;
  }

  getDataTestIdSelector(element) {
    const testIdAttrs = ['data-testid', 'data-test-id', 'data-test', 'data-cy', 'data-qa'];
    
    for (const attr of testIdAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        return `[${attr}="${CSS.escape(value)}"]`;
      }
    }
    return null;
  }

  getAriaLabelSelector(element) {
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) {
      return `[aria-label="${CSS.escape(ariaLabel)}"]`;
    }
    return null;
  }

  getNameSelector(element) {
    const name = element.getAttribute('name');
    if (name) {
      return `[name="${CSS.escape(name)}"]`;
    }
    return null;
  }

  getClassSelector(element) {
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(c => c && this.isValidClass(c));
      if (classes.length > 0) {
        return `.${classes.map(c => CSS.escape(c)).join('.')}`;
      }
    }
    return null;
  }

  getCSSPath(element) {
    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && current.tagName !== 'HTML') {
      let selector = current.tagName.toLowerCase();
      
      if (current.id && this.isValidId(current.id)) {
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

  getOptimizedCSSPath(element) {
    const fullPath = this.getCSSPath(element);
    
    // Try to find shortest unique selector
    const parts = fullPath.split(' > ');
    
    for (let i = parts.length - 1; i >= 0; i--) {
      const selector = parts.slice(i).join(' > ');
      const matches = document.querySelectorAll(selector);
      
      if (matches.length === 1 && matches[0] === element) {
        return selector;
      }
    }
    
    return fullPath;
  }

  getXPath(element) {
    if (element.id && this.isValidId(element.id)) {
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

  getAbsoluteXPath(element) {
    const path = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE) {
      const tagName = current.tagName.toLowerCase();
      let index = 1;

      if (current.parentNode) {
        const siblings = Array.from(current.parentNode.childNodes)
          .filter(node => node.nodeType === Node.ELEMENT_NODE && node.tagName === current.tagName);
        index = siblings.indexOf(current) + 1;
      }

      path.unshift(`${tagName}[${index}]`);
      current = current.parentElement;
    }

    return `/${path.join('/')}`;
  }

  getTextSelector(element) {
    const text = element.textContent?.trim();
    if (text && text.length > 0 && text.length < 100) {
      // For exact text matching
      const tagName = element.tagName.toLowerCase();
      return `//${tagName}[normalize-space()="${text}"]`;
    }
    return null;
  }

  getLinkTextSelector(element) {
    if (element.tagName.toLowerCase() === 'a') {
      const text = element.textContent?.trim();
      if (text) {
        return `link=${text}`;
      }
    }
    return null;
  }

  getPartialLinkTextSelector(element) {
    if (element.tagName.toLowerCase() === 'a') {
      const text = element.textContent?.trim();
      if (text && text.length > 10) {
        const partial = text.substring(0, 20);
        return `partialLink=${partial}`;
      }
    }
    return null;
  }

  getAttributeSelectors(element) {
    const selectors = {};
    const importantAttrs = ['role', 'type', 'placeholder', 'title', 'alt'];
    
    for (const attr of importantAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        selectors[attr] = `[${attr}="${CSS.escape(value)}"]`;
      }
    }
    
    return Object.keys(selectors).length > 0 ? selectors : null;
  }

  getPositionSelector(element) {
    const rect = element.getBoundingClientRect();
    const parent = element.parentElement;
    
    if (parent) {
      const siblings = Array.from(parent.children);
      const index = siblings.indexOf(element);
      
      return {
        index: index,
        position: `${element.tagName.toLowerCase()}:nth-child(${index + 1})`,
        bounds: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        }
      };
    }
    
    return null;
  }

  getShadowDOMPath(element) {
    const path = [];
    let current = element;
    let host = null;

    // Traverse up to find shadow host
    while (current) {
      if (current.getRootNode() instanceof ShadowRoot) {
        host = current.getRootNode().host;
        // Build path within shadow DOM
        let shadowPath = [];
        let shadowCurrent = element;
        
        while (shadowCurrent && shadowCurrent !== host) {
          const selector = this.getElementSelector(shadowCurrent);
          shadowPath.unshift(selector);
          shadowCurrent = shadowCurrent.parentElement;
        }
        
        path.unshift({
          host: this.getElementSelector(host),
          shadowPath: shadowPath.join(' > ')
        });
        
        current = host;
      } else {
        const selector = this.getElementSelector(current);
        path.unshift(selector);
        current = current.parentElement;
      }
    }

    return path.length > 0 ? path : null;
  }

  getElementSelector(element) {
    if (element.id && this.isValidId(element.id)) {
      return `#${CSS.escape(element.id)}`;
    }
    
    let selector = element.tagName.toLowerCase();
    
    if (element.className && typeof element.className === 'string') {
      const classes = element.className.trim().split(/\s+/).filter(c => c && this.isValidClass(c));
      if (classes.length > 0) {
        selector += `.${classes.map(c => CSS.escape(c)).join('.')}`;
      }
    }
    
    return selector;
  }

  // Validation helpers
  isValidId(id) {
    // Check if ID is not auto-generated or dynamic
    const invalidPatterns = [
      /^[0-9]+$/,                    // Pure numbers
      /^ember[0-9]+$/,               // Ember.js
      /^react-/,                     // React
      /^ng-/,                        // Angular
      /^vue-/,                       // Vue.js
      /^ext-gen/,                    // ExtJS
      /^gwt-uid/,                    // GWT
      /^[a-f0-9]{8}-[a-f0-9]{4}-/   // UUID-like
    ];
    
    return !invalidPatterns.some(pattern => pattern.test(id));
  }

  isValidClass(className) {
    // Check if class is not auto-generated
    const invalidPatterns = [
      /^ng-/,                        // Angular
      /^v-/,                         // Vue.js
      /^css-[0-9]+/,                 // CSS modules
      /^[a-f0-9]{6,}$/,             // Hash-like
      /^styled-components/           // Styled components
    ];
    
    return !invalidPatterns.some(pattern => pattern.test(className));
  }

  // Verify selector works
  verifySelector(selector, element) {
    try {
      const matches = document.querySelectorAll(selector);
      return matches.length === 1 && matches[0] === element;
    } catch (e) {
      return false;
    }
  }

  // Get all working selectors
  getWorkingSelectors(element) {
    const allSelectors = this.generateAllSelectors(element);
    const workingSelectors = {};
    
    for (const [key, selector] of Object.entries(allSelectors)) {
      if (typeof selector === 'string' && this.verifySelector(selector, element)) {
        workingSelectors[key] = selector;
      }
    }
    
    return workingSelectors;
  }
}

// Export singleton instance
const selectorGenerator = new SelectorGenerator();

// Also export the class for testing
export { SelectorGenerator };
export default selectorGenerator;