/**
 * Runs in the page's own JS world. It only reports style changes the isolated content
 * script cannot observe (CSSOM edits, adopted sheets, new shadow roots, SPA navigations).
 * It exposes no API and accepts no input from the page.
 */
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  allFrames: true,
  matchAboutBlank: true,
  world: 'MAIN',

  main() {
    const doc = document;
    const pending = new Set<EventTarget>();
    let scheduled = false;
    const kinds = new WeakMap<EventTarget, string>();

    const flush = () => {
      scheduled = false;
      for (const target of pending) {
        const kind = kinds.get(target) ?? '__sdm:adopted';
        target.dispatchEvent(new CustomEvent(kind, { bubbles: true, composed: true }));
      }
      pending.clear();
    };

    const notify = (target: EventTarget, kind: string) => {
      kinds.set(target, kind);
      pending.add(target);
      if (!scheduled) {
        scheduled = true;
        queueMicrotask(flush);
      }
    };

    const sheetChanged = (sheet: CSSStyleSheet) => {
      const owner = sheet.ownerNode;
      if (owner) notify(owner, '__sdm:sheet');
      else notify(doc, '__sdm:adopted');
    };

    const proto = CSSStyleSheet.prototype;
    const wrap = <K extends 'insertRule' | 'deleteRule' | 'replaceSync' | 'addRule' | 'removeRule'>(
      name: K,
    ) => {
      const original = proto[name] as unknown as (...args: unknown[]) => unknown;
      if (typeof original !== 'function') return;
      Object.defineProperty(proto, name, {
        configurable: true,
        writable: true,
        value: function (this: CSSStyleSheet, ...args: unknown[]) {
          const result = original.apply(this, args);
          sheetChanged(this);
          return result;
        },
      });
    };
    wrap('insertRule');
    wrap('deleteRule');
    wrap('replaceSync');
    wrap('addRule');
    wrap('removeRule');

    const originalReplace = proto.replace;
    Object.defineProperty(proto, 'replace', {
      configurable: true,
      writable: true,
      value: function (this: CSSStyleSheet, text: string) {
        return originalReplace.call(this, text).then((sheet) => {
          sheetChanged(this);
          return sheet;
        });
      },
    });

    for (const ctor of [Document, ShadowRoot]) {
      const desc = Object.getOwnPropertyDescriptor(ctor.prototype, 'adoptedStyleSheets');
      if (!desc?.set || !desc.get) continue;
      const { get, set } = desc;
      Object.defineProperty(ctor.prototype, 'adoptedStyleSheets', {
        configurable: true,
        enumerable: desc.enumerable ?? true,
        get,
        set(this: Document | ShadowRoot, value: CSSStyleSheet[]) {
          set.call(this, value);
          notify(this instanceof ShadowRoot ? this.host : doc, '__sdm:adopted');
        },
      });
    }

    const attachShadow = Element.prototype.attachShadow;
    Element.prototype.attachShadow = function (this: Element, init: ShadowRootInit) {
      const root = attachShadow.call(this, init);
      if (init.mode === 'open') notify(this, '__sdm:shadow');
      return root;
    };

    for (const method of ['pushState', 'replaceState'] as const) {
      const original = history[method];
      history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
        const result = original.apply(this, args);
        notify(window, '__sdm:navigate');
        return result;
      };
    }
  },
});
