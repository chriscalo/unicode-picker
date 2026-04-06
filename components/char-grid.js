import { element, fragment } from "../lib/dom.js";

const ROW_HEIGHT = 138;
const HEADER_HEIGHT = 40;
const BUFFER_ROWS = 3;

export class CharGrid extends HTMLElement {
  #items = [];
  #blocks = [];
  #blockLayout = [];
  #totalHeight = 0;
  #currentBlockIdx = -1;
  #selectedIndex = -1;
  #cols = 1;
  #scrollContainer;
  #spacer;
  #grid;
  #blocksContainer;
  #stickyHeader;
  #content;
  #cellTemplate;
  #emptyTemplate;
  #resizeObserver;

  constructor() {
    super();
    this.#cellTemplate = document.getElementById(
      "char-cell-template",
    );
    this.#emptyTemplate = document.getElementById(
      "char-grid-empty-template",
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
    this.#stickyHeader =
      this.shadowRoot.querySelector(
        ".sticky-header",
      );
    this.#blocksContainer = element("div");
    this.#spacer.appendChild(
      this.#blocksContainer,
    );
    this.#content = element("div");
    this.shadowRoot.appendChild(this.#content);

    this.#scrollContainer.addEventListener(
      "scroll",
      () => this.#onScroll(),
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

    this.shadowRoot.addEventListener(
      "mousemove",
      (e) => {
        const cell =
          e.target.closest(".char-cell");
        if (!cell) return;
        const idx = parseInt(cell.dataset.index);
        if (idx === this.#selectedIndex) return;
        this.dispatchEvent(new CustomEvent(
          "selection-change",
          { detail: idx, bubbles: true },
        ));
      },
    );

    this.#resizeObserver = new ResizeObserver(
      () => {
        this.#measureCols();
        this.#computeBlockLayout();
        this.#updateLayout();
        this.#renderVisible();
        if (this.#blockLayout.length) {
          this.#stickyHeader.style.transform =
            "";
          this.#updateStickyHeader();
        }
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

  set selectedIndex(idx) {
    if (idx === this.#selectedIndex) return;
    this.#selectedIndex = idx;
    const prev =
      this.shadowRoot.querySelector(".selected");
    if (prev) prev.classList.remove("selected");
    const next = this.shadowRoot.querySelector(
      `.char-cell[data-index="${idx}"]`,
    );
    if (next) next.classList.add("selected");
  }

  showCopied(index) {
    const cell = this.shadowRoot.querySelector(
      `.char-cell[data-index="${index}"]`,
    );
    if (!cell) return;
    cell.classList.remove("copied");
    void cell.offsetWidth;
    cell.classList.add("copied");
    cell.addEventListener(
      "animationend",
      () => cell.classList.remove("copied"),
      { once: true },
    );
  }

  update(items, { blocks = [] } = {}) {
    this.#items = items;
    this.#blocks = blocks;
    this.#currentBlockIdx = -1;
    this.#content.replaceChildren();
    this.#blocksContainer.replaceChildren();
    this.#scrollContainer.style.display = "";
    this.#scrollContainer.scrollTop = 0;
    this.#computeBlockLayout();
    this.#updateLayout();
    this.#renderVisible();
    if (this.#blockLayout.length) {
      this.#updateStickyHeader();
      this.#stickyHeader.style.display = "";
    } else {
      this.#stickyHeader.textContent = "";
      this.#stickyHeader.style.display = "none";
    }
  }

  showEmpty(message) {
    this.#items = [];
    this.#blockLayout = [];
    this.#scrollContainer.style.display = "none";
    this.#stickyHeader.textContent = "";
    this.#stickyHeader.style.display = "none";
    this.#content.replaceChildren();
    const empty = this.#emptyTemplate.content
      .cloneNode(true)
      .querySelector(".empty");
    empty.textContent = message;
    this.#content.appendChild(empty);
  }

  scrollToIndex(index) {
    if (this.#blockLayout.length) {
      this.#scrollToIndexWithBlocks(index);
    } else {
      this.#scrollToIndexFlat(index);
    }
  }

  #onScroll() {
    this.#renderVisible();
    if (this.#blockLayout.length) {
      this.#updateStickyHeader();
    }
  }

  #computeBlockLayout() {
    if (!this.#blocks.length) {
      this.#blockLayout = [];
      this.#totalHeight = 0;
      return;
    }

    const layout = [];
    let offset = 0;

    for (let i = 0; i < this.#blocks.length; i++) {
      const block = this.#blocks[i];
      const nextStart =
        i + 1 < this.#blocks.length ?
          this.#blocks[i + 1].startIndex :
          this.#items.length;
      const charCount =
        nextStart - block.startIndex;
      if (charCount <= 0) continue;
      const charRows =
        Math.ceil(charCount / this.#cols);

      layout.push({
        name: block.name,
        startIndex: block.startIndex,
        charCount,
        charRows,
        pixelTop: offset,
        charsPixelTop: offset + HEADER_HEIGHT,
      });

      offset +=
        HEADER_HEIGHT + charRows * ROW_HEIGHT;
    }

    this.#blockLayout = layout;
    this.#totalHeight = offset;
  }

  #updateLayout() {
    if (this.#blockLayout.length) {
      this.#spacer.style.height =
        this.#totalHeight + "px";
    } else {
      const totalRows = Math.ceil(
        this.#items.length / this.#cols,
      );
      this.#spacer.style.height =
        (totalRows * ROW_HEIGHT) + "px";
    }
  }

  #updateStickyHeader() {
    const scrollTop =
      this.#scrollContainer.scrollTop;
    const blockIdx =
      this.#blockIndexAtPixel(scrollTop);
    const block = this.#blockLayout[blockIdx];

    if (!block) {
      this.#stickyHeader.textContent = "";
      return;
    }

    if (blockIdx !== this.#currentBlockIdx) {
      this.#currentBlockIdx = blockIdx;
      this.#stickyHeader.textContent = block.name;
      this.dispatchEvent(new CustomEvent(
        "block-change",
        {
          detail: {
            name: block.name,
            startIndex: block.startIndex,
          },
          bubbles: true,
        },
      ));
    }

    // Push effect: next header pushes current up
    const nextBlock =
      this.#blockLayout[blockIdx + 1];
    if (nextBlock) {
      const overlap =
        (scrollTop + HEADER_HEIGHT)
        - nextBlock.pixelTop;
      if (overlap > 0) {
        this.#stickyHeader.style.transform =
          `translateY(${-overlap}px)`;
      } else {
        this.#stickyHeader.style.transform = "";
      }
    } else {
      this.#stickyHeader.style.transform = "";
    }
  }

  #blockForIndex(index) {
    let lo = 0;
    let hi = this.#blockLayout.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (
        this.#blockLayout[mid].startIndex <= index
      ) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return this.#blockLayout[lo] || null;
  }

  #blockIndexAtPixel(pixel) {
    let lo = 0;
    let hi = this.#blockLayout.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (
        this.#blockLayout[mid].pixelTop <= pixel
      ) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }

  #scrollToIndexFlat(index) {
    const row = Math.floor(index / this.#cols);
    const rowTop = row * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const viewTop =
      this.#scrollContainer.scrollTop;
    const viewBottom =
      viewTop
      + this.#scrollContainer.clientHeight;

    if (rowTop < viewTop) {
      this.#scrollContainer.scrollTop = rowTop;
    } else if (rowBottom > viewBottom) {
      this.#scrollContainer.scrollTop =
        rowBottom
        - this.#scrollContainer.clientHeight;
    }
  }

  #scrollToIndexWithBlocks(index) {
    const block = this.#blockForIndex(index);
    if (!block) return;
    const rowInBlock = Math.floor(
      (index - block.startIndex) / this.#cols,
    );
    const rowTop =
      block.charsPixelTop
      + rowInBlock * ROW_HEIGHT;
    const rowBottom = rowTop + ROW_HEIGHT;
    const scrollTop =
      this.#scrollContainer.scrollTop;
    const effectiveTop =
      scrollTop + HEADER_HEIGHT;
    const viewBottom =
      scrollTop
      + this.#scrollContainer.clientHeight;

    if (rowTop < effectiveTop) {
      this.#scrollContainer.scrollTop =
        rowInBlock === 0 ?
          block.pixelTop :
          rowTop - HEADER_HEIGHT;
    } else if (rowBottom > viewBottom) {
      if (rowInBlock === 0) {
        this.#scrollContainer.scrollTop =
          block.pixelTop;
      } else {
        this.#scrollContainer.scrollTop =
          rowBottom
          - this.#scrollContainer.clientHeight;
      }
    }
  }

  #measureCols() {
    const width =
      this.#scrollContainer.clientWidth - 24;
    this.#cols = Math.max(
      1,
      Math.floor((width + 12) / 116),
    );
  }

  #renderVisible() {
    if (this.#items.length === 0) return;

    if (this.#blockLayout.length) {
      this.#renderVisibleWithBlocks();
    } else {
      this.#renderVisibleFlat();
    }
  }

  #renderVisibleFlat() {
    this.#grid.style.display = "";
    this.#blocksContainer.replaceChildren();

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

  #renderVisibleWithBlocks() {
    this.#grid.style.display = "none";

    const scrollTop =
      this.#scrollContainer.scrollTop;
    const viewHeight =
      this.#scrollContainer.clientHeight;
    const bufferPx = BUFFER_ROWS * ROW_HEIGHT;
    const viewTop = scrollTop - bufferPx;
    const viewBottom =
      scrollTop + viewHeight + bufferPx;

    this.#blocksContainer.replaceChildren();
    const containerFrag = fragment();

    for (const block of this.#blockLayout) {
      const blockBottom =
        block.charsPixelTop
        + block.charRows * ROW_HEIGHT;
      if (blockBottom < viewTop) continue;
      if (block.pixelTop > viewBottom) break;

      const section = element("div", {
        className: "block-section",
      });
      section.style.top = block.pixelTop + "px";

      const label = element("div", {
        className: "section-label",
        textContent: block.name,
      });
      section.appendChild(label);

      const firstCharRow = Math.max(
        0,
        Math.floor(
          (viewTop - block.charsPixelTop)
          / ROW_HEIGHT,
        ),
      );
      const lastCharRow = Math.min(
        block.charRows - 1,
        Math.ceil(
          (viewBottom - block.charsPixelTop)
          / ROW_HEIGHT,
        ),
      );

      if (lastCharRow >= firstCharRow) {
        const grid = element("div", {
          className: "block-grid",
        });
        grid.style.top =
          (HEADER_HEIGHT
            + firstCharRow * ROW_HEIGHT)
          + "px";

        const startIdx =
          block.startIndex
          + firstCharRow * this.#cols;
        const endIdx = Math.min(
          block.startIndex
            + (lastCharRow + 1) * this.#cols,
          block.startIndex + block.charCount,
        );

        const cellFrag = fragment();
        for (
          let idx = startIdx; idx < endIdx; idx++
        ) {
          if (this.#items[idx]) {
            cellFrag.appendChild(
              this.#createCell(
                this.#items[idx], idx,
              ),
            );
          }
        }
        grid.appendChild(cellFrag);
        section.appendChild(grid);
      }

      containerFrag.appendChild(section);
    }

    this.#blocksContainer.appendChild(
      containerFrag,
    );
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
