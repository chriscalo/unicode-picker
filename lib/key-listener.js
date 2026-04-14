const IS_APPLE = /Mac|iPhone|iPad/.test(
  navigator.platform,
);

const ALIASES = {
  Esc: "Escape",
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Del: "Delete",
  Ins: "Insert",
};

function resolveKey(name) {
  return ALIASES[name] ?? name;
}

function descriptorFor(chain) {
  const mods = { mod: false, shift: false, alt: false };
  let key = null;
  for (const part of chain) {
    if (part === "Mod") {
      mods.mod = true;
    } else if (part === "Shift") {
      mods.shift = true;
    } else if (part === "Alt") {
      mods.alt = true;
    } else {
      key = resolveKey(part);
    }
  }
  return { ...mods, key };
}

function matches(event, descriptor) {
  const modPressed = IS_APPLE ?
    event.metaKey : event.ctrlKey;
  if (descriptor.mod !== modPressed) return false;
  if (descriptor.shift !== event.shiftKey) return false;
  if (descriptor.alt !== event.altKey) return false;
  return event.key === descriptor.key;
}

const KEY = new Proxy({}, {
  get(_target, prop) {
    return buildChain([prop]);
  },
});

function buildChain(chain) {
  const descriptor = descriptorFor(chain);
  return new Proxy(descriptor, {
    get(target, prop) {
      if (prop === "key" || prop === "mod"
        || prop === "shift" || prop === "alt") {
        return target[prop];
      }
      return buildChain([...chain, prop]);
    },
  });
}

class KeyListener {
  #element;
  #bindings = [];
  #handler;
  
  constructor(element) {
    this.#element = element;
    this.#handler = (event) => {
      for (const [descriptor, callback] of
        this.#bindings
      ) {
        if (matches(event, descriptor)) {
          event.preventDefault();
          callback(event);
          return;
        }
      }
    };
    this.#element.addEventListener(
      "keydown", this.#handler,
    );
  }
  
  keydown(descriptor, callback) {
    this.#bindings.push([descriptor, callback]);
    return this;
  }
  
  off() {
    this.#element.removeEventListener(
      "keydown", this.#handler,
    );
    this.#bindings = [];
    return this;
  }
}

export { KEY, KeyListener };
