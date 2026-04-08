import "./copy-toast.css";

export class CopyToast extends HTMLElement {
  #timeout = null;
  
  constructor() {
    super();
  }
  
  show(message, duration = 1500) {
    this.textContent = message;
    this.classList.add("visible");
    clearTimeout(this.#timeout);
    this.#timeout = setTimeout(() => {
      this.classList.remove("visible");
    }, duration);
  }
}

customElements.define("copy-toast", CopyToast);
