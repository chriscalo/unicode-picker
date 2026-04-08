import { element, fragment } from "../lib/dom.js";
import "./char-grid.css";

const BUFFER_ROWS = 3;

export class CharGrid extends HTMLElement {
  #items = [];
  #blocks = [];
  #blockLayout = [];
  #totalHeight = 0;
  #currentBlockIdx = -1;
  #selectedIndex = -1;
  #rowHeight = 0;
  #headerHeight = 0;
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
    this.appendChild(
      template.content.cloneNode(true),
    );

    this.#scrollContainer =
      this.querySelector(
        ".scroll-container",
      );
    this.#spacer =
      this.querySelector(
        ".scroll-spacer",
      );
    this.#grid =
      this.querySelector(".grid");
    this.#stickyHeader =
      this.querySelector(
        ".sticky-header",
      );
    this.#blocksContainer = element("div");
    this.#spacer.appendChild(
      this.#blocksContainer,
    );
    this.#content = element("div");
    this.appendChild(this.#content);

    this.#scrollContainer.addEventListener(
      "scroll",
      () => this.#onScroll(),
    );

    this.addEventListener(
      "click",
      event => {
        const cell =
          event.target.closest(".char-cell");
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

    this.addEventListener(
      "mousemove",
      event => {
        const cell =
          event.target.closest(".char-cell");
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
        this.#measureLayout();
        this.#computeBlockLayout();
        this.#updateLayout();
        this.#renderVisible();
        if (this.#blockLayout.length) {
          this.#stickyHeader.style.setProperty(
            "--header-translate", "0px",
          );
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

  moveDown(index) {
    if (!this.#blockLayout.length) {
      const target = index + this.#cols;
      return target < this.#items.length ?
        target : index;
    }
    const blockIndex =
      this.#blockLayoutIndex(index);
    const block =
      this.#blockLayout[blockIndex];
    const local = index - block.startIndex;
    const row =
      Math.floor(local / this.#cols);
    const col = local % this.#cols;

    if (row + 1 < block.charRows) {
      return Math.min(
        block.startIndex
          + (row + 1) * this.#cols + col,
        block.startIndex
          + block.charCount - 1,
      );
    }

    const next =
      this.#blockLayout[blockIndex + 1];
    if (!next) return index;
    return Math.min(
      next.startIndex + col,
      next.startIndex + next.charCount - 1,
    );
  }

  moveUp(index) {
    if (!this.#blockLayout.length) {
      const target = index - this.#cols;
      return target >= 0 ? target : index;
    }
    const blockIndex =
      this.#blockLayoutIndex(index);
    const block =
      this.#blockLayout[blockIndex];
    const local = index - block.startIndex;
    const row =
      Math.floor(local / this.#cols);
    const col = local % this.#cols;

    if (row > 0) {
      return block.startIndex
        + (row - 1) * this.#cols + col;
    }

    const prev =
      this.#blockLayout[blockIndex - 1];
    if (!prev) return index;
    const lastRow = prev.charRows - 1;
    return Math.min(
      prev.startIndex
        + lastRow * this.#cols + col,
      prev.startIndex + prev.charCount - 1,
    );
  }

  set selectedIndex(idx) {
    if (idx === this.#selectedIndex) return;
    this.#selectedIndex = idx;
    const prev =
      this.querySelector(
        "[aria-selected='true']",
      );
    if (prev) prev.removeAttribute(
      "aria-selected",
    );
    const next = this.querySelector(
      `.char-cell[data-index="${idx}"]`,
    );
    if (next) next.setAttribute(
      "aria-selected", "true",
    );
  }

  showCopied(index) {
    const cell = this.querySelector(
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
    this.#scrollContainer.hidden = false;
    this.#scrollContainer.scrollTop = 0;
    this.#computeBlockLayout();
    this.#updateLayout();
    this.#renderVisible();
    if (this.#blockLayout.length) {
      this.#updateStickyHeader();
      this.#stickyHeader.hidden = false;
    } else {
      this.#stickyHeader.textContent = "";
      this.#stickyHeader.hidden = true;
    }
  }

  showEmpty(message) {
    this.#items = [];
    this.#blockLayout = [];
    this.#scrollContainer.hidden = true;
    this.#stickyHeader.textContent = "";
    this.#stickyHeader.hidden = true;
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

    for (
      const [blockIdx, block] of
      this.#blocks.entries()
    ) {
      const nextStart =
        blockIdx + 1 < this.#blocks.length ?
          this.#blocks[blockIdx + 1].startIndex :
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
        charsPixelTop: offset + this.#headerHeight,
      });

      offset +=
        this.#headerHeight + charRows * this.#rowHeight;
    }

    this.#blockLayout = layout;
    this.#totalHeight = offset;
  }

  #updateLayout() {
    if (this.#blockLayout.length) {
      this.#spacer.style.setProperty(
        "--spacer-height",
        this.#totalHeight + "px",
      );
    } else {
      const totalRows = Math.ceil(
        this.#items.length / this.#cols,
      );
      this.#spacer.style.setProperty(
        "--spacer-height",
        (totalRows * this.#rowHeight) + "px",
      );
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
        (scrollTop + this.#headerHeight)
        - nextBlock.pixelTop;
      if (overlap > 0) {
        this.#stickyHeader.style.setProperty(
          "--header-translate",
          `${-overlap}px`,
        );
      } else {
        this.#stickyHeader.style.setProperty(
          "--header-translate", "0px",
        );
      }
    } else {
      this.#stickyHeader.style.setProperty(
        "--header-translate", "0px",
      );
    }
  }

  #blockForIndex(index) {
    return this.#blockLayout[
      this.#blockLayoutIndex(index)
    ] || null;
  }

  #blockLayoutIndex(index) {
    let low = 0;
    let high = this.#blockLayout.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (
        this.#blockLayout[mid].startIndex
          <= index
      ) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  #blockIndexAtPixel(pixel) {
    let low = 0;
    let high = this.#blockLayout.length - 1;
    while (low < high) {
      const mid = (low + high + 1) >> 1;
      if (
        this.#blockLayout[mid].pixelTop <= pixel
      ) {
        low = mid;
      } else {
        high = mid - 1;
      }
    }
    return low;
  }

  #scrollToIndexFlat(index) {
    const row = Math.floor(index / this.#cols);
    const rowTop = row * this.#rowHeight;
    const rowBottom = rowTop + this.#rowHeight;
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
      + rowInBlock * this.#rowHeight;
    const rowBottom = rowTop + this.#rowHeight;
    const scrollTop =
      this.#scrollContainer.scrollTop;
    const effectiveTop =
      scrollTop + this.#headerHeight;
    const viewBottom =
      scrollTop
      + this.#scrollContainer.clientHeight;

    if (rowTop < effectiveTop) {
      this.#scrollContainer.scrollTop =
        rowInBlock === 0 ?
          block.pixelTop :
          rowTop - this.#headerHeight;
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

  #measureLayout() {
    const gridCS = getComputedStyle(this.#grid);
    const cellHeight =
      parseFloat(gridCS.gridAutoRows);
    const gap = parseFloat(gridCS.gap);
    this.#rowHeight = cellHeight + gap;

    const headerCS =
      getComputedStyle(this.#stickyHeader);
    this.#headerHeight =
      parseFloat(headerCS.height) + gap;

    const colMin = parseFloat(
      gridCS.getPropertyValue("--_col-min"),
    );
    const containerCS =
      getComputedStyle(this.#scrollContainer);
    const padH =
      parseFloat(containerCS.paddingLeft)
      + parseFloat(containerCS.paddingRight);
    const width =
      this.#scrollContainer.clientWidth - padH;
    this.#cols = Math.max(
      1,
      Math.floor(
        (width + gap) / (colMin + gap),
      ),
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
    this.#grid.hidden = false;
    this.#blocksContainer.replaceChildren();

    const scrollTop =
      this.#scrollContainer.scrollTop;
    const viewHeight =
      this.#scrollContainer.clientHeight;

    const firstRow = Math.max(
      0,
      Math.floor(scrollTop / this.#rowHeight)
        - BUFFER_ROWS,
    );
    const lastRow = Math.min(
      Math.ceil(this.#items.length / this.#cols)
        - 1,
      Math.ceil(
        (scrollTop + viewHeight)
        / this.#rowHeight,
      ) + BUFFER_ROWS,
    );

    const startIndex = firstRow * this.#cols;
    const endIndex = Math.min(
      (lastRow + 1) * this.#cols,
      this.#items.length,
    );

    this.#grid.style.setProperty(
      "--grid-top",
      (firstRow * this.#rowHeight) + "px",
    );
    this.#grid.replaceChildren();

    const frag = fragment();
    for (
      const [offset, entry] of
      this.#items.slice(startIndex, endIndex)
        .entries()
    ) {
      frag.appendChild(
        this.#createCell(
          entry, startIndex + offset,
        ),
      );
    }
    this.#grid.appendChild(frag);
  }

  #renderVisibleWithBlocks() {
    this.#grid.hidden = true;

    const scrollTop =
      this.#scrollContainer.scrollTop;
    const viewHeight =
      this.#scrollContainer.clientHeight;
    const bufferPx =
      BUFFER_ROWS * this.#rowHeight;
    const viewTop = scrollTop - bufferPx;
    const viewBottom =
      scrollTop + viewHeight + bufferPx;

    this.#blocksContainer.replaceChildren();
    const containerFrag = fragment();

    for (const block of this.#blockLayout) {
      const blockBottom =
        block.charsPixelTop
        + block.charRows * this.#rowHeight;
      if (blockBottom < viewTop) continue;
      if (block.pixelTop > viewBottom) break;

      const section = element("div", {
        className: "block-section",
      });
      section.style.setProperty(
        "--section-top",
        block.pixelTop + "px",
      );

      const label = element("div", {
        className: "section-label",
        textContent: block.name,
      });
      section.appendChild(label);

      const firstCharRow = Math.max(
        0,
        Math.floor(
          (viewTop - block.charsPixelTop)
          / this.#rowHeight,
        ),
      );
      const lastCharRow = Math.min(
        block.charRows - 1,
        Math.ceil(
          (viewBottom - block.charsPixelTop)
          / this.#rowHeight,
        ),
      );

      if (lastCharRow >= firstCharRow) {
        const grid = element("div", {
          className: "block-grid",
        });
        grid.style.setProperty(
          "--grid-top",
          (this.#headerHeight
            + firstCharRow * this.#rowHeight)
          + "px",
        );

        const startIdx =
          block.startIndex
          + firstCharRow * this.#cols;
        const endIdx = Math.min(
          block.startIndex
            + (lastCharRow + 1) * this.#cols,
          block.startIndex + block.charCount,
        );

        const cellFrag = fragment();
        let idx = startIdx;
        while (idx < endIdx) {
          if (this.#items[idx]) {
            cellFrag.appendChild(
              this.#createCell(
                this.#items[idx], idx,
              ),
            );
          }
          idx++;
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
      cell.setAttribute(
        "aria-selected", "true",
      );
    }
    return cell;
  }
}

customElements.define("char-grid", CharGrid);
