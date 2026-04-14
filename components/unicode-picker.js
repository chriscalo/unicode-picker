import "./char-grid.js";
import "./copy-toast.js";
import "./unicode-picker.css";
import { KEY, KeyListener } from "../lib/key-listener.js";

const RECENTS_KEY = "unicode-picker-recents";
const MAX_RECENTS = 36;
const THEME_KEY = "unicode-picker-theme";

export class UnicodePicker extends HTMLElement {
  #allChars = [];
  #blocks = [];
  #filtered = [];
  #filteredBlocks = [];
  #indexMap = new Map();
  #selectedIndex = -1;
  #input;
  #clearBtn;
  #status;
  #grid;
  #toast;
  #blocksNav;
  #themeToggle;
  
  constructor() {
    super();
    const template = document.getElementById(
      "unicode-picker-template",
    );
    this.appendChild(
      template.content.cloneNode(true),
    );
    
    this.#input =
      this.querySelector("input");
    this.#clearBtn =
      this.querySelector(".clear-btn");
    this.#status =
      this.querySelector(".status");
    this.#grid =
      this.querySelector("char-grid");
    this.#toast =
      this.querySelector("copy-toast");
    this.#blocksNav =
      this.querySelector(".blocks-nav");
    this.#themeToggle =
      this.querySelector(
        ".theme-toggle input",
      );
    
    this.#initTheme();
    this.#themeToggle.addEventListener(
      "change",
      () => this.#onThemeToggle(),
    );
    this.#input.addEventListener(
      "input",
      () => {
        this.#search(this.#input.value);
        this.#updateClearBtn();
      },
    );
    this.#clearBtn.addEventListener(
      "click",
      () => {
        this.#input.value = "";
        this.#search("");
        this.#updateClearBtn();
        this.#input.focus();
      },
    );
    new KeyListener(this.#input)
      .keydown(KEY.Down, () => this.#moveGrid("down"))
      .keydown(KEY.Up, () => this.#moveGrid("up"))
      .keydown(KEY.Right, () => this.#moveGrid("right"))
      .keydown(KEY.Left, () => this.#moveGrid("left"))
      .keydown(KEY.Enter, () => this.#copySelected())
      .keydown(KEY.Esc, () => this.#clearSearch());
    this.#grid.addEventListener(
      "char-select",
      event => this.#copyChar(event.detail),
    );
    this.#grid.addEventListener(
      "selection-change",
      event => this.#select(event.detail),
    );
    this.#blocksNav.addEventListener(
      "click",
      event => {
        const btn =
          event.target.closest("button");
        if (!btn || btn.disabled) {
          return;
        }
        this.#activateBlock(btn);
      },
    );
    new KeyListener(this.#blocksNav)
      .keydown(KEY.Down, () => this.#moveNav(1))
      .keydown(KEY.Right, () => this.#moveNav(1))
      .keydown(KEY.Up, () => this.#moveNav(-1))
      .keydown(KEY.Left, () => this.#moveNav(-1))
      .keydown(KEY.Home, () => this.#focusNavStart())
      .keydown(KEY.End, () => this.#focusNavEnd());
    new KeyListener(this)
      .keydown(KEY.Mod.f, () => {
        this.#input.focus();
        this.#input.select();
      });
    this.#grid.addEventListener(
      "block-change",
      event => {
        const { startIndex } = event.detail;
        for (const btn of
          this.#blocksNav.querySelectorAll(
            "button",
          )
        ) {
          const isCurrent =
            parseInt(btn.dataset.index)
              === startIndex;
          btn.setAttribute(
            "aria-current",
            String(isCurrent),
          );
          if (isCurrent) {
            this.#setRovingTab(btn);
          }
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
    this.#updateClearBtn();
    this.#input.focus();
    this.#render();
    this.#scrollBlockIntoView();
  }
  
  #initTheme() {
    let saved;
    try {
      saved = localStorage.getItem(THEME_KEY);
    } catch {}
    const prefersDark =
      window.matchMedia(
        "(prefers-color-scheme: dark)",
      ).matches;
    const theme = saved
      ?? (prefersDark ? "dark" : "light");
    document.documentElement.dataset.theme =
      theme;
    this.#themeToggle.checked =
      theme === "dark";
  }
  
  #onThemeToggle() {
    const next = this.#themeToggle.checked ?
      "dark" : "light";
    document.documentElement.dataset.theme =
      next;
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
  }
  
  #buildBlocksNav() {
    const frag = document.createDocumentFragment();
    for (
      const [index, block] of
      this.#blocks.entries()
    ) {
      const btn = document.createElement("button");
      btn.textContent = block.name;
      btn.dataset.index = block.startIndex;
      btn.setAttribute("role", "option");
      btn.tabIndex = index === 0 ? 0 : -1;
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
        btn.disabled = false;
      }
      return;
    }
    
    const matchIndices = new Set(
      this.#filtered.map(
        (entry) => this.#allChars.indexOf(entry),
      ),
    );
    
    for (
      const [blockIdx, btn] of
      buttons.entries()
    ) {
      const blockStart =
        this.#blocks[blockIdx].startIndex;
      const blockEnd =
        blockIdx + 1 < this.#blocks.length ?
        this.#blocks[blockIdx + 1].startIndex :
        this.#allChars.length;
      let hasMatch = false;
      for (const matchIdx of matchIndices) {
        if (
          matchIdx >= blockStart
          && matchIdx < blockEnd
        ) {
          hasMatch = true;
          break;
        }
      }
      btn.disabled = !hasMatch;
    }
  }
  
  #updateClearBtn() {
    this.#clearBtn.disabled =
      this.#input.value.length === 0;
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
      recent => recent.u !== entry.u,
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
      (entry, index) => {
        const blockIdx =
          this.#blockIndexFor(index);
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
      const [idx, char] of
      this.#allChars.entries()
    ) {
      this.#indexMap.set(char, idx);
    }
  }
  
  #computeFilteredBlocks() {
    if (!this.#filtered.length) return [];
    
    const blocks = [];
    let currentBlockIdx = -1;
    
    for (
      const [idx, entry] of
      this.#filtered.entries()
    ) {
      const origIdx =
        this.#indexMap.get(entry);
      const blockIdx =
        this.#blockIndexFor(origIdx);
      
      if (blockIdx !== currentBlockIdx) {
        blocks.push({
          startIndex: idx,
          name: this.#blocks[blockIdx].name,
        });
        currentBlockIdx = blockIdx;
      }
    }
    
    return blocks;
  }
  
  #blockIndexFor(origIdx) {
    let low = 0;
    let high = this.#blocks.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (
        this.#blocks[mid].startIndex <= origIdx
      ) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }
  
  #resolveBlockIndex(origIndex) {
    if (!this.#input.value.trim()) {
      return origIndex;
    }
    const blockName = this.#blocks.find(
      block => block.startIndex === origIndex,
    )?.name;
    if (!blockName) return origIndex;
    const filtered = this.#filteredBlocks.find(
      block => block.name === blockName,
    );
    return filtered ?
      filtered.startIndex : origIndex;
  }
  
  #clearActiveBlock() {
    for (const btn of
      this.#blocksNav.querySelectorAll(
        "[aria-current='true']",
      )
    ) {
      btn.removeAttribute("aria-current");
    }
  }
  
  #scrollBlockIntoView() {
    const active =
      this.#blocksNav.querySelector(
        "[aria-current='true']",
      );
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }
  
  #activateBlock(btn) {
    const index =
      this.#resolveBlockIndex(
        parseInt(btn.dataset.index),
      );
    this.#grid.scrollToIndex(index);
    this.#select(index);
    this.#setRovingTab(btn);
  }
  
  #setRovingTab(btn) {
    for (const other of
      this.#blocksNav.querySelectorAll("button")
    ) {
      other.tabIndex = -1;
    }
    btn.tabIndex = 0;
  }
  
  #visibleNavButtons() {
    return [
      ...this.#blocksNav.querySelectorAll(
        "button:not(:disabled)",
      ),
    ];
  }
  
  #moveNav(delta) {
    const buttons = this.#visibleNavButtons();
    if (!buttons.length) return;
    const idx = Math.max(0,
      buttons.indexOf(document.activeElement),
    );
    const next =
      (idx + delta + buttons.length)
      % buttons.length;
    const btn = buttons[next];
    this.#activateBlock(btn);
    btn.focus();
  }
  
  #focusNavStart() {
    const btn = this.#visibleNavButtons()[0];
    if (!btn) return;
    this.#activateBlock(btn);
    btn.focus();
  }
  
  #focusNavEnd() {
    const btn =
      this.#visibleNavButtons().at(-1);
    if (!btn) return;
    this.#activateBlock(btn);
    btn.focus();
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
  
  #moveGrid(direction) {
    const list = this.#currentList();
    const index = this.#selectedIndex;
    let next;
    
    if (direction === "down") {
      if (!list.length) return;
      next = index < 0 ?
        0 : this.#grid.moveDown(index);
    } else if (direction === "up") {
      if (!list.length) return;
      next = index < 0 ?
        0 : this.#grid.moveUp(index);
    } else if (direction === "right") {
      if (index >= list.length - 1) return;
      next = index + 1;
    } else if (direction === "left") {
      if (index <= 0) return;
      next = index - 1;
    }
    
    if (next !== index) {
      this.#select(next);
      this.#grid.scrollToIndex(next);
    }
  }
  
  #copySelected() {
    const list = this.#currentList();
    if (
      list.length > 0
      && this.#selectedIndex >= 0
    ) {
      this.#copyChar(
        list[this.#selectedIndex],
      );
    }
  }
  
  #clearSearch() {
    if (this.#input.value) {
      this.#input.value = "";
      this.#search("");
      this.#updateClearBtn();
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
    const hex = line.slice(0, tab);
    const name = line.slice(tab + 1);
    const char =
      String.fromCodePoint(parseInt(hex, 16));
    return { c: char, n: name, u: hex };
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
