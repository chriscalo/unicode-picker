const CHUNK_SIZE = 100;

export class CharGrid extends HTMLElement {
  #items = [];
  #selectedIndex = 0;
  #renderVersion = 0;
  #label = null;
  #content;
  #cellTemplate;
  #emptyTemplate;
  #labelTemplate;
  
  constructor() {
    super();
    this.#cellTemplate = document.getElementById(
      "char-cell-template",
    );
    this.#emptyTemplate = document.getElementById(
      "char-grid-empty-template",
    );
    this.#labelTemplate = document.getElementById(
      "char-grid-label-template",
    );
    const template = document.getElementById(
      "char-grid-template",
    );
    this.attachShadow({ mode: "open" });
    this.shadowRoot.appendChild(
      template.content.cloneNode(true),
    );
    this.#content = document.createElement("div");
    this.shadowRoot.appendChild(this.#content);
    this.shadowRoot.addEventListener("click", (e) => {
      const cell = e.target.closest(".char-cell");
      if (!cell) return;
      const idx = parseInt(cell.dataset.index);
      if (this.#items[idx]) {
        this.dispatchEvent(new CustomEvent(
          "char-select",
          {
            detail: this.#items[idx],
            bubbles: true,
          },
        ));
      }
    });
  }
  
  get selectedIndex() {
    return this.#selectedIndex;
  }
  
  set selectedIndex(val) {
    this.#selectedIndex = val;
    this.render();
  }
  
  get gridCols() {
    const grid =
      this.shadowRoot.querySelector(".grid");
    if (!grid) return 1;
    return getComputedStyle(grid)
      .getPropertyValue("grid-template-columns")
      .split(" ").length;
  }
  
  update(
    items,
    { label = null, selectedIndex = 0 } = {},
  ) {
    this.#items = items;
    this.#selectedIndex = selectedIndex;
    this.#label = label;
    this.render();
  }
  
  showEmpty(message) {
    this.#items = [];
    this.#renderVersion++;
    this.#content.replaceChildren();
    const empty = this.#emptyTemplate.content
      .cloneNode(true)
      .querySelector(".empty");
    empty.textContent = message;
    this.#content.appendChild(empty);
  }
  
  render() {
    this.#renderVersion++;
    const version = this.#renderVersion;
    
    if (this.#items.length === 0) {
      this.showEmpty("No matches");
      return;
    }
    
    this.#content.replaceChildren();
    
    if (this.#label) {
      const label = this.#labelTemplate.content
        .cloneNode(true)
        .querySelector(".section-label");
      label.textContent = this.#label;
      this.#content.appendChild(label);
    }
    
    const grid = document.createElement("div");
    grid.className = "grid";
    this.#content.appendChild(grid);
    
    const first = this.#items.slice(0, CHUNK_SIZE);
    for (let i = 0; i < first.length; i++) {
      grid.appendChild(
        this.#createCell(first[i], i),
      );
    }
    
    this.#scrollToSelected();
    
    if (this.#items.length > CHUNK_SIZE) {
      this.#appendChunks(version, CHUNK_SIZE);
    }
  }
  
  #createCell(entry, index) {
    const cell = this.#cellTemplate.content
      .cloneNode(true)
      .querySelector(".char-cell");
    cell.dataset.index = index;
    cell.querySelector(".char-glyph").textContent =
      entry.c;
    cell.querySelector(".char-name").textContent =
      entry.n;
    if (index === this.#selectedIndex) {
      cell.classList.add("selected");
    }
    return cell;
  }
  
  #appendChunks(version, offset) {
    if (version !== this.#renderVersion) return;
    if (offset >= this.#items.length) return;
    
    requestAnimationFrame(() => {
      if (version !== this.#renderVersion) return;
      const grid =
        this.shadowRoot.querySelector(".grid");
      if (!grid) return;
      
      const end = Math.min(
        offset + CHUNK_SIZE,
        this.#items.length,
      );
      const fragment = document.createDocumentFragment();
      for (let i = offset; i < end; i++) {
        fragment.appendChild(
          this.#createCell(this.#items[i], i),
        );
      }
      grid.appendChild(fragment);
      this.#appendChunks(version, end);
    });
  }
  
  #scrollToSelected() {
    const sel =
      this.shadowRoot.querySelector(".selected");
    if (sel) sel.scrollIntoView({ block: "nearest" });
  }
}

customElements.define("char-grid", CharGrid);
