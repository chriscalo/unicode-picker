import "./char-grid.js";
import "./copy-toast.js";

const RECENTS_KEY = "unicode-picker-recents";
const MAX_RECENTS = 36;

export class UnicodePicker extends HTMLElement {
  #allChars = [];
  #filtered = [];
  #selectedIndex = -1;
  #input;
  #status;
  #grid;
  #toast;

  constructor() {
    super();
    const template = document.getElementById(
      "unicode-picker-template",
    );
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(
      template.content.cloneNode(true),
    );

    this.#input =
      this.shadowRoot.querySelector("input");
    this.#status =
      this.shadowRoot.querySelector(".status");
    this.#grid =
      this.shadowRoot.querySelector("char-grid");
    this.#toast =
      this.shadowRoot.querySelector("copy-toast");

    this.#input.addEventListener(
      "input",
      () => this.#search(this.#input.value),
    );
    this.#input.addEventListener(
      "keydown",
      (e) => this.#onKeydown(e),
    );
    this.#grid.addEventListener(
      "char-select",
      (e) => this.#copyChar(e.detail),
    );
    this.#grid.addEventListener(
      "selection-change",
      (e) => this.#select(e.detail),
    );
  }

  connectedCallback() {
    this.#allChars = parseUnicodeData(
      document.getElementById("unicode-data")
        .textContent,
    );
    const count =
      this.#allChars.length.toLocaleString();
    this.#status.textContent =
      `${count} characters loaded.`;
    this.#input.focus();
    this.#render();
  }

  #select(index) {
    this.#selectedIndex = index;
    this.#grid.selectedIndex = index;
  }

  #getRecents() {
    try {
      const raw =
        localStorage.getItem(RECENTS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  #addRecent(entry) {
    const recents = this.#getRecents().filter(
      (r) => r.u !== entry.u,
    );
    recents.unshift(entry);
    if (recents.length > MAX_RECENTS) {
      recents.length = MAX_RECENTS;
    }
    localStorage.setItem(
      RECENTS_KEY,
      JSON.stringify(recents),
    );
  }

  #search(query) {
    if (!query.trim()) {
      this.#filtered = [];
      this.#status.textContent =
        `${this.#allChars.length.toLocaleString()}`
        + ` characters loaded.`;
      this.#selectedIndex = -1;
      this.#render();
      return;
    }

    const terms = query.toUpperCase().split(/\s+/);
    this.#filtered = this.#allChars.filter(
      (entry) =>
        terms.every((term) =>
          entry.n.includes(term),
        ),
    );

    this.#status.textContent =
      `${this.#filtered.length.toLocaleString()}`
      + ` matches`;
    this.#selectedIndex = -1;
    this.#render();
  }

  #render() {
    const query = this.#input.value.trim();
    const list = this.#currentList();

    if (query && list.length === 0) {
      this.#grid.showEmpty("No matches");
      return;
    }

    this.#grid.update(list);
    this.#grid.selectedIndex =
      this.#selectedIndex;
  }

  #currentList() {
    return this.#input.value.trim() ?
      this.#filtered :
      this.#allChars;
  }

  async #copyChar(entry) {
    await navigator.clipboard.writeText(entry.c);
    this.#addRecent(entry);
    const list = this.#currentList();
    const index = list.indexOf(entry);
    if (index !== -1) {
      this.#grid.showCopied(index);
    }
  }

  #onKeydown(e) {
    const list = this.#currentList();
    const cols = this.#grid.gridCols;
    let newIndex = this.#selectedIndex;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (newIndex + cols < list.length) {
        newIndex += cols;
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (newIndex - cols >= 0) {
        newIndex -= cols;
      }
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (newIndex < list.length - 1) {
        newIndex++;
      }
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (newIndex > 0) {
        newIndex--;
      }
    } else if (
      e.key === "Enter" && list.length > 0
      && this.#selectedIndex >= 0
    ) {
      e.preventDefault();
      this.#copyChar(list[this.#selectedIndex]);
      return;
    } else {
      return;
    }

    if (newIndex !== this.#selectedIndex) {
      this.#select(newIndex);
      this.#grid.scrollToIndex(newIndex);
    }
  }
}

customElements.define(
  "unicode-picker",
  UnicodePicker,
);

function parseUnicodeData(tsv) {
  return tsv.trim().split("\n").map((line) => {
    const tab = line.indexOf("\t");
    const c = line.slice(0, tab);
    const n = line.slice(tab + 1);
    const u = c.codePointAt(0).toString(16);
    return { c, n, u };
  });
}
