import { PageURL } from "./page-url.js";

export function useURLParam(name) {
  const events = new EventTarget();

  PageURL.addEventListener("change", () => {
    events.dispatchEvent(new Event("change"));
  });

  return {
    get value() {
      return PageURL.url.searchParams.get(name);
    },
    get isSet() {
      return PageURL.url.searchParams.has(name);
    },
    set(value) {
      PageURL.replace(
        PageURL.deriveURL(url => url.searchParams.set(name, value)),
      );
    },
    unset() {
      PageURL.replace(
        PageURL.deriveURL(url => url.searchParams.delete(name)),
      );
    },
    addEventListener(type, listener, options) {
      return events.addEventListener(type, listener, options);
    },
    removeEventListener(type, listener, options) {
      return events.removeEventListener(type, listener, options);
    },
  };
}
