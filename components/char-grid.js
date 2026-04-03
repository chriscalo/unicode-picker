import { element, fragment } from "../lib/dom.js";

const ROW_HEIGHT = 108;
const BUFFER_ROWS = 3;

export class CharGrid extends HTMLElement {
  #items = [];
  #selectedIndex = 0;
  #label = null;
  #cols = 1;
  #scrollContainer;
  #spacer;
  #grid;
  #content;
  #cellTemplate;
  #emptyTemplate;
  #labelTemplate;
  #labelEl = null;
  #resizeObserver;

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

    this.#scrollContainer =
      this.shadowRoot.querySelector(
        ".scroll-container",
      );
    this.#spacer =
      this.shadowRoot.querySelector(
        ".scroll-spacer",
      );
    this.#grid =
      this.shadowRoot.querySelector(".grid");
    this.#content = element("div");
    this.shadowRoot.appendChild(this.#content);

    this.#scrollContainer.addEventListener(
      "scroll",
      () => this.#renderVisible(),
    );

    this.shadowRoot.addEventListener(
      "click",
      (e) => {
        const cell =
          e.target.closest(".char-cell");
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
      },
    );

    this.#resizeObserver = new ResizeObserver(
      () => {
        this.#measureCols();
        this.#updateLayout();
        this.#renderVisible();
      },
    );
  }

  connectedCallback() {
    this.#resizeObserver.observe(
      this.#scrollContainer,
    );
  }

  disconnectedCallback() {
    this.#resizeObserver.disconnect();
  }

  get gridCols() {
    return this.#cols;
  }

  update(
    items,
    { label = null, selectedIndex = 0 } = {},
  ) {
    this.#items = items;
    this.#selectedIndex = selectedIndex;
    this.#label = label;
    this.#content.replaceChildren();
    this.#scrollContainer.style.display = "";
    this.#updateLabel();
    this.#updateLayout();
    this.#renderVisible();
  }

  showEmpty(message) {
    this.#items = [];
    this.#scrollContainer.style.display = "none";
    this.#content.replaceChildren();
    const empty = this.#emptyTemplate.content
      .cloneNode(true)
      .querySelector(".empty");
    empty.textContent = message;
    this.#content.appendChild(empty);
  }

  scrollToIndex(index) {
    const row = Math.floor(index / this.#cols);
    const rowTop = row * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewTop = this.#scrollContainer.scrollTop;
    const viewBottom =
      viewTop + this.#scrollContainer.clientHeight;

    if (rowTop < viewTop) {
      this.#scrollContainer.scrollTop = rowTop;
    } else if (rowBottom > viewBottom) {
      this.#scrollContainer.scrollTop =
        rowBottom
        - this.#scrollContainer.clientHeight;
    }
  }

  #updateLabel() {
    if (this.#label) {
      if (!this.#labelEl) {
        this.#labelEl =
          this.#labelTemplate.content
            .cloneNode(true)
            .querySelector(".section-label");
        this.#scrollContainer.prepend(
          this.#labelEl,
        );
      }
      this.#labelEl.textContent = this.#label;
    } else if (this.#labelEl) {
      this.#labelEl.remove();
      this.#labelEl = null;
    }
  }

  #measureCols() {
    const width =
      this.#scrollContainer.clientWidth - 24;
    this.#cols =
      Math.max(1, Math.floor(width / 108));
  }

  #updateLayout() {
    const totalRows =
      Math.ceil(this.#items.length / this.#cols);
    this.#spacer.style.height =
      (totalRows * ROW_HEIGHT) + "px";
  }

  #renderVisible() {
    if (this.#items.length === 0) return;

    const scrollTop =
      this.#scrollContainer.scrollTop;
    const viewHeight =
      this.#scrollContainer.clientHeight;

    const firstRow = Math.max(
      0,
      Math.floor(scrollTop / ROW_HEIGHT)
        - BUFFER_ROWS,
    );
    const lastRow = Math.min(
      Math.ceil(this.#items.length / this.#cols)
        - 1,
      Math.ceil(
        (scrollTop + viewHeight) / ROW_HEIGHT,
      ) + BUFFER_ROWS,
    );

    const startIndex = firstRow * this.#cols;
    const endIndex = Math.min(
      (lastRow + 1) * this.#cols,
      this.#items.length,
    );

    this.#grid.style.top =
      (firstRow * ROW_HEIGHT) + "px";
    this.#grid.replaceChildren();

    const frag = fragment();
    for (
      const [i, entry] of
      this.#items.slice(startIndex, endIndex)
        .entries()
    ) {
      frag.appendChild(
        this.#createCell(entry, startIndex + i),
      );
    }
    this.#grid.appendChild(frag);
  }

  #createCell(entry, index) {
    const cell = this.#cellTemplate.content
      .cloneNode(true)
      .querySelector(".char-cell");
    cell.dataset.index = index;
    cell.querySelector(".char-glyph")
      .textContent = entry.c;
    cell.querySelector(".char-name")
      .textContent = entry.n;
    if (index === this.#selectedIndex) {
      cell.classList.add("selected");
    }
    return cell;
  }
}

customElements.define("char-grid", CharGrid);
