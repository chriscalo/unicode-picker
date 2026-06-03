export class PageURL {
  static #url = new URL(location.href);
  static #events = new EventTarget();

  static {
    const onNavigation = () => {
      const next = new URL(location.href);
      if (next.href !== PageURL.#url.href) {
        PageURL.#url = next;
        PageURL.#events.dispatchEvent(new Event("change"));
      }
    };
    if ("navigation" in window) {
      navigation.addEventListener("navigatesuccess", onNavigation);
    } else {
      window.addEventListener("popstate", onNavigation);
    }
  }

  static get url() {
    return new URL(PageURL.#url.href);
  }

  static push(url) {
    const next = url instanceof URL ? url : new URL(url, location.href);
    if (next.href === PageURL.#url.href) return;
    history.pushState(null, "", next);
    PageURL.#url = next;
    PageURL.#events.dispatchEvent(new Event("change"));
  }

  static replace(url) {
    const next = url instanceof URL ? url : new URL(url, location.href);
    if (next.href === PageURL.#url.href) return;
    history.replaceState(null, "", next);
    PageURL.#url = next;
    PageURL.#events.dispatchEvent(new Event("change"));
  }

  static deriveURL(modifierFn) {
    const derived = new URL(PageURL.#url.href);
    modifierFn(derived);
    return derived;
  }

  static addEventListener(type, listener, options) {
    return PageURL.#events.addEventListener(type, listener, options);
  }

  static removeEventListener(type, listener, options) {
    return PageURL.#events.removeEventListener(type, listener, options);
  }
}
