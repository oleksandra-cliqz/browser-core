import { getDocumentUrl } from '../core/content/helpers';


function injectCSSRule(rule, doc) {
  const css = doc.createElement('style');
  css.type = 'text/css';
  css.id = 'cliqz-adblokcer-css-rules';
  const parent = doc.head || doc.documentElement;
  parent.appendChild(css);
  css.appendChild(doc.createTextNode(rule));
}


function injectScript(s, doc) {
  // Wrap script so that it removes itself when the execution is over.
  const autoRemoveScript = `
    ${s}

    (function() {
      var currentScript = document.currentScript;
      var parent = currentScript && currentScript.parentNode;

      if (parent) {
        parent.removeChild(currentScript);
      }
    })();
  `;

  // Create node
  const script = doc.createElement('script');
  script.type = 'text/javascript';
  script.id = 'cliqz-adblocker-script';
  script.appendChild(doc.createTextNode(autoRemoveScript));

  // Insert node
  const parent = doc.head || doc.documentElement;
  parent.appendChild(script);
}


function blockScript(filter, document) {
  const filterRE = new RegExp(filter);
  document.addEventListener('beforescriptexecute', (ev) => {
    if (filterRE.test(ev.target.textContent)) {
      ev.preventDefault();
      ev.stopPropagation();
    }
  });
}


/**
 * Takes care of injecting cosmetic filters in a given window. Responsabilities:
 * - Inject scripts.
 * - Block scripts.
 * - Inject CSS rules.
 * - Monitor changes using a mutation observer and inject new rules if needed.
 *
 * All this happens by communicating with the background through the
 * `backgroundAction` function (to trigger request the sending of new rules
 * based on a domain or node selectors) and the `handleResponseFromBackground`
 * callback to apply new rules.
 */
export default class {
  constructor(url, window, backgroundAction) {
    this.documentUrl = getDocumentUrl(window);
    this.url = url;
    this.window = window;
    this.backgroundAction = backgroundAction;

    this.mutationObserver = null;
    this.injectedRules = new Set();
    this.injectedScripts = new Set();
    this.blockedScripts = new Set();

    // Get domain rules as soon as possible
    if (this.isMainDocument()) {
      this.backgroundAction('getCosmeticsForDomain', this.url);
    }
  }

  unload() {
    if (this.mutationObserver) {
      try {
        this.mutationObserver.disconnect();
      } catch (e) {
        /* in case the page is closed */
      }
    }
  }

  isMainDocument() {
    return this.window === this.window.parent;
  }

  /**
   * When one or several mutations occur in the window, extract caracteristics
   * (node name, class, tag) from the modified nodes and request matching
   * cosmetic filters to inject in the page.
   */
  onMutation(mutations) {
    let targets = new Set(mutations.map(m => m.target).filter(t => t));

    // TODO - it might be necessary to inject scripts, CSS and block scripts
    // from here into iframes with no src. We could first inject/block
    // everything already present in `this.injectedRules`,
    // `this.injectedScripts` and `this.blockedScripts`. Then we could register
    // the iframe to be subjected to the same future injections as the current
    // window.
    //   targets.forEach((target) => {
    //     if (target.localName === 'iframe') {}
    //     if (target.childElementCount !== 0) {
    //       const iframes = target.getElementsByTagName('iframe');
    //       if (iframes.length !== 0) {}
    //     }
    //   });

    if (targets.size > 100) {
      // In case there are too many mutations we will only check once the whole document
      targets = new Set([this.window.document.body]);
    }

    if (targets.size === 0) {
      return;
    }

    // Collect nodes of targets
    const nodeInfo = new Set();
    targets.forEach((target) => {
      const nodes = target.querySelectorAll('*');
      for (let i = 0; i < nodes.length; i += 1) {
        const node = nodes[i];

        // Ignore hidden nodes
        if (node.offsetWidth === 0 && node.offsetHeight === 0) {
          /* eslint-disable no-continue */
          continue;
        }

        if (node.id) {
          nodeInfo.add(`#${node.id}`);
        }

        if (node.tagName) {
          nodeInfo.add(node.tagName);
        }

        if (node.className && node.className.split) {
          node.className.split(' ').forEach((name) => {
            nodeInfo.add(`.${name}`);
          });
        }
      }
    });

    // Send node info to background to request corresponding cosmetic filters
    if (nodeInfo.size > 0) {
      this.backgroundAction('getCosmeticsForNodes', this.documentUrl, [[...nodeInfo]]);
    }
  }

  onDOMContentLoaded() {
    // TODO - is this necessary? Can a cosmetic filter apply to an element of
    // the DOM?
    // Trigger sending of the cosmetic fitlers for the full page
    // this.onMutation([{ target: this.window.document.body }]);

    // attach mutation obsever in case new nodes are added
    this.mutationObserver = new this.window.MutationObserver(
      mutations => this.onMutation(mutations)
    );
    this.mutationObserver.observe(
      this.window.document,
      { childList: true, subtree: true }
    );
  }

  handleRules(rules) {
    /* eslint-disable no-continue */
    const rulesToInject = [];

    // Check which rules should be injected in the page.
    for (let i = 0; i < rules.length; i += 1) {
      const rule = rules[i];

      if (!this.injectedRules.has(rule)) {
        // Check if the selector would match
        try {
          if (!this.window.document.querySelector(rule)) {
            continue;
          }
        } catch (e) {  // invalid selector
          continue;
        }

        this.injectedRules.add(rule);
        rulesToInject.push(` :root ${rule}`);
      }
    }

    // Inject selected rules
    if (rulesToInject.length > 0) {
      injectCSSRule(
        `${rulesToInject.join(' ,')} {display:none !important;}`,
        this.window.document
      );
    }
  }

  handleResponseFromBackground({ active, scripts, blockedScripts, styles }) {
    if (!active) {
      this.unload();
      return;
    }

    // Inject scripts
    for (let i = 0; i < scripts.length; i += 1) {
      const script = scripts[i];
      if (!this.injectedScripts.has(script)) {
        injectScript(script, this.window.document);
        this.injectedScripts.add(script);
      }
    }

    // Block scripts
    for (let i = 0; i < blockedScripts.length; i += 1) {
      const script = blockedScripts[i];
      if (!this.blockedScripts.has(script)) {
        blockScript(script, this.window.document);
        this.blockedScripts.add(script);
      }
    }

    this.handleRules(styles);
  }
}
