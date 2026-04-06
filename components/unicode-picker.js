import "./char-grid.js";
import "./copy-toast.js";

const RECENTS_KEY = "unicode-picker-recents";
const MAX_RECENTS = 36;

export class UnicodePicker extends HTMLElement {
  #allChars = [];
  #blocks = [];
  #filtered = [];
  #filteredBlocks = [];
  #indexMap = new Map();
  #selectedIndex = -1;
  #input;
  #status;
  #grid;
  #toast;
  #blocksNav;

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
    this.#blocksNav =
      this.shadowRoot.querySelector(".blocks-nav");

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
    this.#blocksNav.addEventListener(
      "click",
      (e) => {
        const btn = e.target.closest("button");
        if (!btn || btn.classList.contains("dimmed")) {
          return;
        }
        const index =
          this.#resolveBlockIndex(
            parseInt(btn.dataset.index),
          );
        this.#grid.scrollToIndex(index);
        this.#select(index);
      },
    );
    this.#grid.addEventListener(
      "block-change",
      (e) => {
        const { startIndex } = e.detail;
        for (const btn of
          this.#blocksNav.querySelectorAll(
            "button",
          )
        ) {
          btn.classList.toggle(
            "active",
            parseInt(btn.dataset.index)
              === startIndex,
          );
        }
        this.#scrollBlockIntoView();
      },
    );
  }

  connectedCallback() {
    this.#allChars = parseUnicodeData(
      document.getElementById("unicode-data")
        .textContent,
    );
    this.#blocks = parseBlocks(
      document.getElementById("unicode-blocks")
        .textContent,
    );
    this.#buildBlocksNav();
    this.#buildIndexMap();
    const count =
      this.#allChars.length.toLocaleString();
    this.#status.textContent =
      `${count} characters`;
    this.#input.focus();
    this.#render();
    this.#scrollBlockIntoView();
  }

  #buildBlocksNav() {
    const frag = document.createDocumentFragment();
    for (const block of this.#blocks) {
      const btn = document.createElement("button");
      btn.textContent = block.name;
      btn.dataset.index = block.startIndex;
      frag.appendChild(btn);
    }
    this.#blocksNav.appendChild(frag);
  }

  #updateBlocksDimming() {
    const query = this.#input.value.trim();
    const buttons =
      this.#blocksNav.querySelectorAll("button");

    if (!query) {
      for (const btn of buttons) {
        btn.classList.remove("dimmed");
      }
      return;
    }

    const matchIndices = new Set(
      this.#filtered.map(
        (entry) => this.#allChars.indexOf(entry),
      ),
    );

    for (const [i, btn] of buttons.entries()) {
      const blockStart = this.#blocks[i].startIndex;
      const blockEnd = i + 1 < this.#blocks.length ?
        this.#blocks[i + 1].startIndex :
        this.#allChars.length;
      let hasMatch = false;
      for (const idx of matchIndices) {
        if (idx >= blockStart && idx < blockEnd) {
          hasMatch = true;
          break;
        }
      }
      btn.classList.toggle("dimmed", !hasMatch);
    }
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
        + ` characters`;
      this.#selectedIndex = -1;
      this.#render();
      this.#updateBlocksDimming();
      return;
    }

    this.#clearActiveBlock();
    const terms = query.toUpperCase().split(/\s+/);
    this.#filtered = this.#allChars.filter(
      (entry, i) => {
        const blockIdx = this.#blockIndexFor(i);
        const blockName =
          this.#blocks[blockIdx].name
            .toUpperCase();
        return terms.every((term) =>
          entry.n.includes(term)
          || blockName.includes(term),
        );
      },
    );
    this.#filteredBlocks =
      this.#computeFilteredBlocks();

    this.#status.textContent =
      `${this.#filtered.length.toLocaleString()}`
      + ` matching characters`;
    this.#selectedIndex = -1;
    this.#render();
    this.#updateBlocksDimming();
  }

  #render() {
    const query = this.#input.value.trim();
    const list = this.#currentList();

    if (query && list.length === 0) {
      this.#grid.showEmpty("No matches");
      return;
    }

    const blocks = query ?
      this.#filteredBlocks :
      this.#blocks;
    this.#grid.update(list, { blocks });
    this.#grid.selectedIndex =
      this.#selectedIndex;
  }

  #currentList() {
    return this.#input.value.trim() ?
      this.#filtered :
      this.#allChars;
  }

  #buildIndexMap() {
    this.#indexMap = new Map();
    for (
      let i = 0;
      i < this.#allChars.length;
      i++
    ) {
      this.#indexMap.set(
        this.#allChars[i], i,
      );
    }
  }

  #computeFilteredBlocks() {
    if (!this.#filtered.length) return [];

    const blocks = [];
    let currentBlockIdx = -1;

    for (
      let i = 0;
      i < this.#filtered.length;
      i++
    ) {
      const origIdx = this.#indexMap.get(
        this.#filtered[i],
      );
      const blockIdx =
        this.#blockIndexFor(origIdx);

      if (blockIdx !== currentBlockIdx) {
        blocks.push({
          startIndex: i,
          name: this.#blocks[blockIdx].name,
        });
        currentBlockIdx = blockIdx;
      }
    }

    return blocks;
  }

  #blockIndexFor(origIdx) {
    let lo = 0;
    let hi = this.#blocks.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (
        this.#blocks[mid].startIndex <= origIdx
      ) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  #resolveBlockIndex(origIndex) {
    if (!this.#input.value.trim()) {
      return origIndex;
    }
    const blockName = this.#blocks.find(
      (b) => b.startIndex === origIndex,
    )?.name;
    if (!blockName) return origIndex;
    const filtered = this.#filteredBlocks.find(
      (b) => b.name === blockName,
    );
    return filtered ?
      filtered.startIndex : origIndex;
  }

  #clearActiveBlock() {
    for (const btn of
      this.#blocksNav.querySelectorAll(
        ".active",
      )
    ) {
      btn.classList.remove("active");
    }
  }

  #scrollBlockIntoView() {
    const active =
      this.#blocksNav.querySelector(".active");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
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
    } else if (e.key === "Escape") {
      if (this.#input.value) {
        e.preventDefault();
        this.#input.value = "";
        this.#search("");
      }
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

function parseBlocks(tsv) {
  return tsv.trim().split("\n").map((line) => {
    const tab = line.indexOf("\t");
    const startIndex = parseInt(line.slice(0, tab));
    const name = line.slice(tab + 1);
    return { startIndex, name };
  });
}
