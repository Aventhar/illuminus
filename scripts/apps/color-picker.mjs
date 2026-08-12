import { hexToRgba, rgbaToHex, rgbToHsl, hslToRgb, pickFromWindow } from "../color-tools.mjs";

/**
 * Illuminus's own color picker, replacing the operating system panel that a
 * native `<input type="color">` opens.
 *
 * That panel cannot express alpha, looks nothing like the rest of the
 * interface, and its eyedropper depends on screen capture that is not available
 * everywhere. This one offers RGB and HSL together — edit either and the other
 * follows — an opacity control on both, the hex including its alpha, and a set
 * of saved colors belonging to the style being edited.
 *
 * Changes show on the live sample as they are made, but only OK keeps them:
 * Cancel, Escape, and closing all restore the value the picker opened with.
 */

/** The picker currently on screen, if any. */
let open = null;

/** How many saved-color slots to show, filled or not. */
const SWATCH_SLOTS = 20;

/** Slider definitions, in display order. Each reads and writes the shared color. */
const CHANNELS = [
  { group: "rgb", key: "r", label: "R", min: 0, max: 255, step: 1, unit: "" },
  { group: "rgb", key: "g", label: "G", min: 0, max: 255, step: 1, unit: "" },
  { group: "rgb", key: "b", label: "B", min: 0, max: 255, step: 1, unit: "" },
  { group: "rgb", key: "a", label: "A", min: 0, max: 100, step: 1, unit: "%" },
  { group: "hsl", key: "h", label: "H", min: 0, max: 360, step: 1, unit: "°" },
  { group: "hsl", key: "s", label: "S", min: 0, max: 100, step: 1, unit: "%" },
  { group: "hsl", key: "l", label: "L", min: 0, max: 100, step: 1, unit: "%" },
  { group: "hsl", key: "a", label: "A", min: 0, max: 100, step: 1, unit: "%" }
];

/**
 * Open the picker beside an anchor element.
 * @param {object} options
 * @param {HTMLElement} options.anchor  Element to appear to the right of.
 * @param {string} options.value        Starting color, as hex.
 * @param {(hex: string) => void} options.onChange   Called as the color changes.
 * @param {(hex: string) => void} [options.onCommit] Called when OK is pressed.
 * @param {string[]} [options.swatches] Saved colors for the style being edited.
 * @param {(swatches: string[]) => void} [options.onSwatches] Called when they change.
 * @returns {object} A handle with a `close()` method.
 */
export function openColorPicker({ anchor, value, onChange, onCommit, swatches = [], onSwatches }) {
  closeColorPicker();

  const initial = value;
  const parsed = hexToRgba(value) ?? { r: 0, g: 0, b: 0, a: 1 };
  const state = { r: parsed.r, g: parsed.g, b: parsed.b, a: parsed.a * 100 };
  let saved = [...swatches];

  const root = document.createElement("div");
  root.className = "illuminus illuminus-cp";
  root.innerHTML = `
    <header class="illuminus-cp__bar">
      <i class="fa-solid fa-grip-lines" inert></i>
      <span class="illuminus-cp__title">${game.i18n.localize("ILLUMINUS.ColorPicker.Title")}</span>
      <button type="button" class="illuminus-cp__close" data-cp="cancel"
              aria-label="${game.i18n.localize("ILLUMINUS.Buttons.Cancel")}">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </header>

    <div class="illuminus-cp__body">
      <div class="illuminus-cp__readout">
        <span class="illuminus-cp__preview"></span>
        <input type="text" class="illuminus-cp__hex" spellcheck="false" autocomplete="off"
               aria-label="${game.i18n.localize("ILLUMINUS.ColorPicker.Hex")}">
        <button type="button" class="illuminus-cp__sample" data-cp="sample"
                data-tooltip="${game.i18n.localize("ILLUMINUS.Buttons.PickColorTooltip")}"
                aria-label="${game.i18n.localize("ILLUMINUS.Buttons.PickColor")}">
          <i class="fa-solid fa-eye-dropper"></i>
        </button>
      </div>

      ${["rgb", "hsl"].map((group) => `
        <section class="illuminus-cp__group" data-group="${group}">
          <h4>${game.i18n.localize(`ILLUMINUS.ColorPicker.${group === "rgb" ? "Rgb" : "Hsl"}`)}</h4>
          ${CHANNELS.filter((c) => c.group === group).map((c) => `
            <div class="illuminus-cp__channel" data-channel="${group}-${c.key}">
              <label for="illuminus-cp-${group}-${c.key}">${c.label}</label>
              <input type="range" id="illuminus-cp-${group}-${c.key}"
                     min="${c.min}" max="${c.max}" step="${c.step}"
                     data-group="${group}" data-key="${c.key}">
              <input type="number" min="${c.min}" max="${c.max}" step="${c.step}"
                     data-group="${group}" data-key="${c.key}"
                     aria-label="${c.label}">
              <span class="illuminus-cp__unit">${c.unit}</span>
            </div>`).join("")}
        </section>`).join("")}

      <section class="illuminus-cp__group illuminus-cp__saved">
        <h4>
          ${game.i18n.localize("ILLUMINUS.ColorPicker.Saved")}
          <button type="button" class="illuminus-cp__save" data-cp="save">
            <i class="fa-solid fa-plus"></i> ${game.i18n.localize("ILLUMINUS.ColorPicker.SaveColor")}
          </button>
        </h4>
        <div class="illuminus-cp__swatches"></div>
      </section>
    </div>

    <footer class="illuminus-cp__foot">
      <button type="button" data-cp="cancel">${game.i18n.localize("ILLUMINUS.Buttons.Cancel")}</button>
      <button type="button" class="illuminus-cp__ok" data-cp="ok">${game.i18n.localize("ILLUMINUS.Buttons.OK")}</button>
    </footer>`;
  document.body.append(root);

  const hexInput = root.querySelector(".illuminus-cp__hex");
  const preview = root.querySelector(".illuminus-cp__preview");
  const swatchBox = root.querySelector(".illuminus-cp__swatches");

  const currentHex = () => rgbaToHex({ r: state.r, g: state.g, b: state.b, a: state.a / 100 });

  /** Values for one group, derived from the shared colour. */
  const valuesFor = (group) => {
    if (group === "rgb") return { r: state.r, g: state.g, b: state.b, a: state.a };
    const { h, s, l } = rgbToHsl(state);
    return { h, s, l, a: state.a };
  };

  /** Redraw every control from the shared color. */
  const refresh = ({ skipHex = false, skipNumbers = false } = {}) => {
    const hex = currentHex();
    const opaque = rgbaToHex({ r: state.r, g: state.g, b: state.b, a: 1 });
    const hsl = rgbToHsl(state);

    for (const channel of CHANNELS) {
      const values = valuesFor(channel.group);
      const value = Math.round(values[channel.key]);
      const row = root.querySelector(`[data-channel="${channel.group}-${channel.key}"]`);
      row.querySelector('input[type="range"]').value = String(value);
      if (!skipNumbers) row.querySelector('input[type="number"]').value = String(value);
      // Each track previews what moving it would do.
      row.style.setProperty("--illuminus-cp-track", trackFor(channel, hsl));
    }

    preview.style.setProperty("--illuminus-swatch", hex);
    root.style.setProperty("--illuminus-cp-current", opaque);
    if (!skipHex) hexInput.value = hex;
    return hex;
  };

  /** The gradient shown behind a slider. */
  const trackFor = (channel, hsl) => {
    const at = (over) => rgbaToHex({ ...state, ...over, a: 1 });
    switch (`${channel.group}.${channel.key}`) {
      case "rgb.r": return `linear-gradient(to right, ${at({ r: 0 })}, ${at({ r: 255 })})`;
      case "rgb.g": return `linear-gradient(to right, ${at({ g: 0 })}, ${at({ g: 255 })})`;
      case "rgb.b": return `linear-gradient(to right, ${at({ b: 0 })}, ${at({ b: 255 })})`;
      case "hsl.h": return "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";
      case "hsl.s": return `linear-gradient(to right, ${rgbaToHex({ ...hslToRgb({ ...hsl, s: 0 }), a: 1 })}, `
        + `${rgbaToHex({ ...hslToRgb({ ...hsl, s: 100 }), a: 1 })})`;
      case "hsl.l": return `linear-gradient(to right, #000, ${rgbaToHex({ ...hslToRgb({ ...hsl, l: 50 }), a: 1 })}, #fff)`;
      default: return `linear-gradient(to right, ${rgbaToHex({ ...state, a: 0 })}, ${rgbaToHex({ ...state, a: 1 })})`;
    }
  };

  const emit = (options) => onChange(refresh(options));

  /** Apply a change coming from one of the two groups. */
  const setChannel = (group, key, raw, options) => {
    const channel = CHANNELS.find((c) => c.group === group && c.key === key);
    const value = Math.min(channel.max, Math.max(channel.min, Number(raw)));
    if (!Number.isFinite(value)) return;

    if (key === "a") state.a = value;
    else if (group === "rgb") state[key] = value;
    else {
      // Editing HSL means recomputing RGB from all three, not just this one.
      const hsl = { ...rgbToHsl(state), [key]: value };
      Object.assign(state, hslToRgb(hsl));
    }
    emit(options);
  };

  root.addEventListener("input", (event) => {
    const input = event.target;
    if (!input.dataset?.group) return;
    // While typing in a number field, leave that field's own text alone.
    setChannel(input.dataset.group, input.dataset.key, input.value,
      input.type === "number" ? { skipNumbers: true } : {});
  });

  hexInput.addEventListener("input", () => {
    const value = hexToRgba(hexInput.value);
    if (!value) return; // Half-typed values are ignored rather than reverted.
    state.r = value.r;
    state.g = value.g;
    state.b = value.b;
    state.a = value.a * 100;
    emit({ skipHex: true });
  });

  /* --- Saved colors ---------------------------------------------------- */

  const drawSwatches = () => {
    swatchBox.replaceChildren();
    const slots = Math.max(SWATCH_SLOTS, Math.ceil(saved.length / 10) * 10);
    for (let i = 0; i < slots; i++) {
      const hex = saved[i];
      // A slot wraps the two buttons: nesting one button inside another is
      // invalid, and the remove control needs a hit area of its own.
      const slot = document.createElement("span");
      slot.className = "illuminus-cp__slot";

      const cell = document.createElement(hex ? "button" : "span");
      cell.className = `illuminus-cp__swatch${hex ? "" : " is-empty"}`;
      if (hex) {
        cell.type = "button";
        cell.dataset.cp = "use";
        cell.dataset.hex = hex;
        cell.dataset.index = String(i);
        cell.style.setProperty("--illuminus-swatch", hex);
        cell.title = hex;
        cell.setAttribute("aria-label", hex);
      }
      slot.append(cell);

      if (hex) {
        const remove = document.createElement("button");
        remove.type = "button";
        remove.className = "illuminus-cp__forget";
        remove.dataset.cp = "forget";
        remove.dataset.index = String(i);
        remove.title = game.i18n.localize("ILLUMINUS.ColorPicker.Forget");
        remove.setAttribute("aria-label", game.i18n.localize("ILLUMINUS.ColorPicker.Forget"));
        remove.innerHTML = '<i class="fa-solid fa-xmark" inert></i>';
        slot.append(remove);
      }
      swatchBox.append(slot);
    }
  };

  const persist = () => {
    saved = saved.slice(0, 40);
    onSwatches?.([...saved]);
    drawSwatches();
  };

  /* --- Buttons --------------------------------------------------------- */

  root.addEventListener("click", async (event) => {
    // Read from the element that carries the action, not from whatever child
    // was clicked — an icon inside a button has no dataset of its own.
    const control = event.target.closest("[data-cp]");
    const action = control?.dataset.cp;
    if (!action) return;
    event.preventDefault();

    if (action === "forget") {
      event.stopPropagation();
      saved.splice(Number(control.dataset.index), 1);
      persist();
    } else if (action === "use") {
      const value = hexToRgba(control.dataset.hex);
      if (!value) return;
      state.r = value.r; state.g = value.g; state.b = value.b; state.a = value.a * 100;
      emit();
    } else if (action === "save") {
      const hex = currentHex();
      if (!saved.includes(hex)) saved.push(hex);
      persist();
    } else if (action === "sample") {
      root.classList.add("is-sampling");
      const sampled = await pickFromWindow();
      root.classList.remove("is-sampling");
      const value = sampled ? hexToRgba(sampled) : null;
      if (!value) return;
      state.r = value.r; state.g = value.g; state.b = value.b; state.a = value.a * 100;
      emit();
    } else if (action === "ok") {
      const hex = currentHex();
      onCommit?.(hex);
      closeColorPicker();
    } else if (action === "cancel") {
      onChange(initial);
      closeColorPicker();
    }
  });

  /* --- Placement and dragging ------------------------------------------ */

  const place = () => {
    const box = anchor.getBoundingClientRect();
    const size = root.getBoundingClientRect();
    const left = box.right + 8 + size.width > window.innerWidth - 8
      ? Math.max(8, box.left - size.width - 8)   // no room to the right
      : box.right + 8;
    const top = Math.min(Math.max(8, box.top - 8), window.innerHeight - size.height - 8);
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(Math.max(8, top))}px`;
  };

  // Delete or Backspace on a focused saved color removes it, so removal does
  // not depend on landing a small hover target.
  swatchBox.addEventListener("keydown", (event) => {
    if (event.key !== "Delete" && event.key !== "Backspace") return;
    const cell = event.target.closest("[data-cp='use']");
    if (!cell) return;
    event.preventDefault();
    saved.splice(Number(cell.dataset.index), 1);
    persist();
  });

  root.querySelector(".illuminus-cp__bar").addEventListener("pointerdown", (event) => {
    if (event.target.closest("button")) return;
    event.preventDefault();
    const box = root.getBoundingClientRect();
    const dx = event.clientX - box.left;
    const dy = event.clientY - box.top;
    const move = (e) => {
      root.style.left = `${Math.round(Math.min(Math.max(0, e.clientX - dx), window.innerWidth - box.width))}px`;
      root.style.top = `${Math.round(Math.min(Math.max(0, e.clientY - dy), window.innerHeight - box.height))}px`;
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });

  const onKey = (event) => {
    if (event.key !== "Escape") return;
    // Sampling owns the window while it runs; Escape belongs to it.
    if (document.documentElement.classList.contains("illuminus-picking")) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(initial);
    closeColorPicker();
  };

  drawSwatches();
  refresh();
  place();
  document.addEventListener("keydown", onKey, true);
  hexInput.focus();
  hexInput.select();

  open = {
    root,
    close() {
      document.removeEventListener("keydown", onKey, true);
      root.remove();
      open = null;
    }
  };
  return open;
}

/** Close the picker if one is open. */
export function closeColorPicker() {
  open?.close();
}

/** Whether a picker is currently on screen. */
export function isColorPickerOpen() {
  return Boolean(open);
}
