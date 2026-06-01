class PageURLClass extends EventTarget {
  #url = new URL(location.href);

  constructor() {
    super();
    const onNavigation = () => {
      const next = new URL(location.href);
      if (next.href !== this.#url.href) {
        this.#url = next;
        this.dispatchEvent(new Event("change"));
      }
    };
    if ("navigation" in window) {
      navigation.addEventListener("navigatesuccess", onNavigation);
    } else {
      window.addEventListener("popstate", onNavigation);
    }
  }

  get url() {
    return new URL(this.#url.href);
  }

  push(url) {
    const next = url instanceof URL ? url : new URL(url, location.href);
    if (next.href === this.#url.href) return;
    history.pushState(null, "", next);
    this.#url = next;
    this.dispatchEvent(new Event("change"));
  }

  replace(url) {
    const next = url instanceof URL ? url : new URL(url, location.href);
    if (next.href === this.#url.href) return;
    history.replaceState(null, "", next);
    this.#url = next;
    this.dispatchEvent(new Event("change"));
  }

  deriveURL(modifierFn) {
    const derived = new URL(this.#url.href);
    modifierFn(derived);
    return derived;
  }
}

export const PageURL = new PageURLClass();
