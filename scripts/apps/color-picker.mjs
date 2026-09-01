import {
  hexToRgba, rgbaToHex, rgbToHsl, hslToRgb, rgbToHsv, hsvToRgb, pickFromWindow
} from "../color-tools.mjs";
import { SETTINGS, getSetting, setSetting } from "../constants.mjs";

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
const SWATCH_SLOTS = 30;

/** Slider definitions, in display order. Each reads and writes the shared color. */
const CHANNELS = [
  { group: "hsl", key: "h", label: "H", min: 0, max: 360, step: 1, unit: "°" },
  { group: "hsl", key: "s", label: "S", min: 0, max: 100, step: 1, unit: "%" },
  { group: "hsl", key: "l", label: "L", min: 0, max: 100, step: 1, unit: "%" },
  { group: "hsl", key: "a", label: "A", min: 0, max: 100, step: 1, unit: "%" },
  { group: "rgb", key: "r", label: "R", min: 0, max: 255, step: 1, unit: "" },
  { group: "rgb", key: "g", label: "G", min: 0, max: 255, step: 1, unit: "" },
  { group: "rgb", key: "b", label: "B", min: 0, max: 255, step: 1, unit: "" },
  { group: "rgb", key: "a", label: "A", min: 0, max: 100, step: 1, unit: "%" }
];

/** The two ways of saying a color, and which is on show. */
const GROUPS = ["hsl", "rgb"];

/** How many recently used colors to offer back. */
const RECENT_SLOTS = 10;

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

      <section class="illuminus-cp__group illuminus-cp__ramp">
        <div class="illuminus-cp__sv" tabindex="0"
             aria-label="${game.i18n.localize("ILLUMINUS.ColorPicker.Ramp")}">
          <span class="illuminus-cp__sv-knob"></span>
        </div>
        <div class="illuminus-cp__hue" tabindex="0"
             aria-label="${game.i18n.localize("ILLUMINUS.ColorPicker.Hue")}">
          <span class="illuminus-cp__hue-knob"></span>
        </div>
      </section>

      ${GROUPS.map((group) => `
        <section class="illuminus-cp__group illuminus-cp__sliders" data-group="${group}">
          <h4>
            ${game.i18n.localize(group === "hsl"
              ? "ILLUMINUS.ColorPicker.Hsl" : "ILLUMINUS.ColorPicker.Rgb")}
            <button type="button" class="illuminus-cp__swap" data-cp="swap"
                    data-tooltip="${game.i18n.localize("ILLUMINUS.ColorPicker.SwapSliders")}">
              <i class="fa-solid fa-right-left"></i>
              ${game.i18n.localize(group === "hsl"
                ? "ILLUMINUS.ColorPicker.Rgb" : "ILLUMINUS.ColorPicker.Hsl")}
            </button>
          </h4>
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

      <section class="illuminus-cp__group illuminus-cp__recent">
        <h4>${game.i18n.localize("ILLUMINUS.ColorPicker.Recent")}</h4>
        <div class="illuminus-cp__recents"></div>
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

  /** Values for one group, derived from the shared color. */
  const valuesFor = (group) => {
    if (group !== "hsl") return { r: state.r, g: state.g, b: state.b, a: state.a };
    // The hue shown is the one kept beside the color rather than the one read
    // back out of it. They agree wherever there is a hue to read, and where
    // there is not — a gray, or anything at full lightness — reading it back
    // says zero, and the slider would jump to red while the color stood still.
    return { ...rgbToHsl(state), h: hue, a: state.a };
  };

  /**
   * Hue is kept beside the color rather than read back from it.
   *
   * Every gray has the same red-green-blue, so a color picked at zero
   * saturation has no hue to recover — reading it back would snap the ramp to
   * red the moment the knob touched the left edge, and the shade under the
   * pointer would change while the pointer stood still.
   */
  let hue = rgbToHsv(state).h;

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

    drawRamp();
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
      // Each track shows what moving it would do, so the hue track is the whole
      // wheel at this saturation and lightness, and the other two run from one
      // end of their own range to the other.
      case "hsl.h": return `linear-gradient(to right, ${[0, 60, 120, 180, 240, 300, 360]
        .map((h) => rgbaToHex({ ...hslToRgb({ ...hsl, h }), a: 1 })).join(", ")})`;
      case "hsl.s": return `linear-gradient(to right, `
        + `${rgbaToHex({ ...hslToRgb({ ...hsl, h: hue, s: 0 }), a: 1 })}, `
        + `${rgbaToHex({ ...hslToRgb({ ...hsl, h: hue, s: 100 }), a: 1 })})`;
      case "hsl.l": return `linear-gradient(to right, #000000, `
        + `${rgbaToHex({ ...hslToRgb({ ...hsl, h: hue, l: 50 }), a: 1 })}, #ffffff)`;
      default: return `linear-gradient(to right, ${rgbaToHex({ ...state, a: 0 })}, ${rgbaToHex({ ...state, a: 1 })})`;
    }
  };

  /**
   * Which of the two sets of sliders is on show.
   *
   * Both are in the markup and one is hidden, rather than the hidden one being
   * left out: the switch swaps them without a re-render, and the values in the
   * set nobody is looking at are kept in step anyway, so there is nothing to
   * catch up when it comes back.
   */
  const showSliders = (which) => {
    for (const section of root.querySelectorAll(".illuminus-cp__sliders")) {
      section.classList.toggle("is-hidden", section.dataset.group !== which);
    }
  };
  showSliders(getSetting(SETTINGS.colorSliders) ?? "hsl");

  const emit = (options) => onChange(refresh(options));

  /** Apply a change coming from one of the two groups. */
  const setChannel = (group, key, raw, options) => {
    const channel = CHANNELS.find((c) => c.group === group && c.key === key);
    const value = Math.min(channel.max, Math.max(channel.min, Number(raw)));
    if (!Number.isFinite(value)) return;

    if (key === "a") state.a = value;
    else if (group === "hsl") {
      // Read as a whole and written back as a whole: hue, saturation and
      // lightness only mean anything together, and the color the picker keeps
      // is the red-green-blue one — so switching between the two ways of
      // saying it cannot drift the color, and nothing is lost in a round trip
      // that was not lost already.
      const said = { ...valuesFor("hsl"), [key]: value };
      Object.assign(state, hslToRgb(said));
      // Said rather than recovered, for the reason above: a gray has no hue to
      // read back, and dragging saturation to nothing would otherwise throw
      // away the hue a person was working in.
      hue = said.h;
      emit(options);
      return;
    } else state[key] = value;
    // Typing an RGB value moves the ramp with it.
    hue = rgbToHsv(state).h;
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
      const entry = saved[i];
      const hex = entry?.hex ?? entry;
      const name = entry?.name ?? "";
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
        cell.draggable = true;
        // The name is what a palette is for: "Rust heading" beats "#7a2010"
        // when there are twenty of them.
        cell.title = name ? `${name} — ${hex}` : hex;
        cell.setAttribute("aria-label", name || hex);
        if (name) cell.dataset.name = name;
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

  /* --- Reordering and naming ------------------------------------------- */

  let dragFrom = null;

  swatchBox.addEventListener("dragstart", (event) => {
    const cell = event.target.closest(".illuminus-cp__swatch[data-index]");
    if (!cell) return;
    dragFrom = Number(cell.dataset.index);
    event.dataTransfer.effectAllowed = "move";
    // Firefox will not start a drag without data on the transfer.
    event.dataTransfer.setData("text/plain", cell.dataset.hex ?? "");
    cell.classList.add("is-dragging");
  });

  swatchBox.addEventListener("dragover", (event) => {
    if (dragFrom === null) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  });

  swatchBox.addEventListener("drop", (event) => {
    if (dragFrom === null) return;
    event.preventDefault();
    const slot = event.target.closest(".illuminus-cp__slot");
    const cells = [...swatchBox.querySelectorAll(".illuminus-cp__slot")];
    const to = Math.min(slot ? cells.indexOf(slot) : saved.length - 1, saved.length - 1);
    if (to >= 0 && to !== dragFrom) {
      const [moved] = saved.splice(dragFrom, 1);
      saved.splice(to, 0, moved);
      persist();
    }
    dragFrom = null;
  });

  swatchBox.addEventListener("dragend", () => {
    dragFrom = null;
    for (const cell of swatchBox.querySelectorAll(".is-dragging")) cell.classList.remove("is-dragging");
  });

  swatchBox.addEventListener("dblclick", async (event) => {
    const cell = event.target.closest(".illuminus-cp__swatch[data-index]");
    if (!cell) return;
    event.preventDefault();
    const index = Number(cell.dataset.index);
    const entry = saved[index];
    if (!entry) return;
    const name = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize("ILLUMINUS.ColorPicker.NameTitle") },
      content: `<input type="text" name="name" autofocus value="${foundry.utils.escapeHTML(entry.name ?? "")}"`
        + ` placeholder="${game.i18n.localize("ILLUMINUS.ColorPicker.NamePlaceholder")}">`,
      ok: { label: "ILLUMINUS.Buttons.Save", callback: (_e, button) => button.form.elements.name.value },
      rejectClose: false
    });
    if (name === null || name === undefined) return;
    saved[index] = { hex: entry.hex ?? entry, name: String(name).trim().slice(0, 40) };
    persist();
  });

  /* --- Recently used --------------------------------------------------- */

  const recentBox = root.querySelector(".illuminus-cp__recents");

  const drawRecents = () => {
    const recents = (getSetting(SETTINGS.recentColors) ?? []).slice(0, RECENT_SLOTS);
    recentBox.replaceChildren();
    for (let i = 0; i < RECENT_SLOTS; i++) {
      const hex = recents[i];
      const cell = document.createElement(hex ? "button" : "span");
      cell.className = `illuminus-cp__swatch${hex ? "" : " is-empty"}`;
      if (hex) {
        cell.type = "button";
        cell.dataset.cp = "use";
        cell.dataset.hex = hex;
        cell.style.setProperty("--illuminus-swatch", hex);
        cell.title = hex;
        cell.setAttribute("aria-label", hex);
      }
      recentBox.append(cell);
    }
  };

  /** Remember a color that was actually chosen, most recent first. */
  const rememberRecent = async (hex) => {
    const recents = (getSetting(SETTINGS.recentColors) ?? []).filter((c) => c !== hex);
    recents.unshift(hex);
    await setSetting(SETTINGS.recentColors, recents.slice(0, RECENT_SLOTS));
    drawRecents();
  };

  /* --- Buttons --------------------------------------------------------- */

  /** Set while the question below is on screen, so Escape answers it alone. */
  let asking = false;

  /**
   * Forget a saved color, having asked first.
   *
   * A palette is built up over a whole style and there is no putting one back,
   * so the one irreversible thing in this window asks before doing it. Both
   * ways in come through here — the small cross that appears under the pointer
   * and the Delete key on a focused swatch — because a warning on one of them
   * is not a warning.
   *
   * Found again by identity rather than by the index it was clicked at: the
   * question is answered a moment later, and the list may have been dragged
   * into a different order in between.
   */
  const forget = async (index) => {
    const entry = saved[index];
    if (entry === undefined) return;
    const hex = entry?.hex ?? entry;
    const name = entry?.name;
    asking = true;
    let sure = false;
    try {
      sure = await foundry.applications.api.DialogV2.confirm({
        window: { title: game.i18n.localize("ILLUMINUS.Confirm.ForgetColorTitle") },
        content: `<p>${game.i18n.format("ILLUMINUS.Confirm.ForgetColor", {
          color: name ? `${name} (${hex})` : hex
        })}</p>`
      });
    } finally {
      asking = false;
    }
    if (!sure) return;
    const at = saved.indexOf(entry);
    if (at < 0) return;
    saved.splice(at, 1);
    persist();
  };

  root.addEventListener("click", async (event) => {
    // Read from the element that carries the action, not from whatever child
    // was clicked — an icon inside a button has no dataset of its own.
    const control = event.target.closest("[data-cp]");
    const action = control?.dataset.cp;
    if (!action) return;
    event.preventDefault();

    if (action === "forget") {
      event.stopPropagation();
      await forget(Number(control.dataset.index));
    } else if (action === "use") {
      const value = hexToRgba(control.dataset.hex);
      if (!value) return;
      state.r = value.r; state.g = value.g; state.b = value.b; state.a = value.a * 100;
      // The ramp moves with it, as it does when the numbers are typed. The hue
      // is kept beside the color rather than read back out of it, so a color
      // arriving from anywhere but the ramp has to say so — or the shade square
      // goes on offering shades of the hue before it.
      hue = rgbToHsv(state).h;
      emit();
    } else if (action === "swap") {
      const now = root.querySelector(".illuminus-cp__sliders:not(.is-hidden)")?.dataset.group;
      const next = now === "hsl" ? "rgb" : "hsl";
      showSliders(next);
      setSetting(SETTINGS.colorSliders, next);
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
      hue = rgbToHsv(state).h;
      emit();
    } else if (action === "ok") {
      const hex = currentHex();
      // Only a color someone actually kept is worth offering back.
      await rememberRecent(hex);
      onCommit?.(hex);
      closeColorPicker();
    } else if (action === "cancel") {
      onChange(initial);
      closeColorPicker();
    }
  });

  /* --- The ramp -------------------------------------------------------- */

  const svBox = root.querySelector(".illuminus-cp__sv");
  const svKnob = root.querySelector(".illuminus-cp__sv-knob");
  const hueBox = root.querySelector(".illuminus-cp__hue");
  const hueKnob = root.querySelector(".illuminus-cp__hue-knob");

  /** Put the knobs where the current color sits, and tint the square. */
  function drawRamp() {
    const { s: sat, v } = rgbToHsv(state);
    svBox.style.setProperty("--illuminus-cp-hue",
      rgbaToHex({ ...hsvToRgb({ h: hue, s: 1, v: 1 }), a: 1 }));
    svKnob.style.left = `${sat * 100}%`;
    svKnob.style.top = `${(1 - v) * 100}%`;
    hueKnob.style.top = `${(hue / 360) * 100}%`;
  }

  /** Read a pointer position as a 0..1 pair within an element. */
  const positionIn = (element, event) => {
    const box = element.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
      y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height))
    };
  };

  /**
   * Drag anywhere in a ramp, including outside it.
   *
   * Pointer capture rather than document listeners: without it the drag stops
   * the moment the pointer leaves the square, which is exactly when someone is
   * reaching for full saturation.
   */
  const dragRamp = (element, apply) => {
    element.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      element.setPointerCapture(event.pointerId);
      apply(positionIn(element, event));
      const onMove = (move) => apply(positionIn(element, move));
      const onUp = () => {
        element.releasePointerCapture(event.pointerId);
        element.removeEventListener("pointermove", onMove);
        element.removeEventListener("pointerup", onUp);
      };
      element.addEventListener("pointermove", onMove);
      element.addEventListener("pointerup", onUp);
    });
  };

  dragRamp(svBox, ({ x, y }) => {
    Object.assign(state, hsvToRgb({ h: hue, s: x, v: 1 - y }));
    emit();
  });

  dragRamp(hueBox, ({ y }) => {
    hue = y * 360;
    const { s: sat, v } = rgbToHsv(state);
    Object.assign(state, hsvToRgb({ h: hue, s: sat, v }));
    emit();
  });

  // Arrow keys nudge, so the ramp is usable without a mouse.
  svBox.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 0.1 : 0.02;
    const { s: sat, v } = rgbToHsv(state);
    const moves = {
      ArrowLeft: { s: sat - step, v }, ArrowRight: { s: sat + step, v },
      ArrowUp: { s: sat, v: v + step }, ArrowDown: { s: sat, v: v - step }
    };
    const next = moves[event.key];
    if (!next) return;
    event.preventDefault();
    Object.assign(state, hsvToRgb({
      h: hue,
      s: Math.min(1, Math.max(0, next.s)),
      v: Math.min(1, Math.max(0, next.v))
    }));
    emit();
  });

  hueBox.addEventListener("keydown", (event) => {
    const step = event.shiftKey ? 30 : 5;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    hue = (hue + (event.key === "ArrowDown" ? step : -step) + 360) % 360;
    const { s: sat, v } = rgbToHsv(state);
    Object.assign(state, hsvToRgb({ h: hue, s: sat, v }));
    emit();
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
    forget(Number(cell.dataset.index));
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
    // Sampling owns the window while it runs; Escape belongs to it. So does a
    // question about forgetting a color — answering that one with Escape would
    // otherwise close the picker as well, and put the color back to what it
    // was, which is not what "no, keep it" means.
    if (asking) return;
    if (document.documentElement.classList.contains("illuminus-picking")) return;
    event.preventDefault();
    event.stopPropagation();
    onChange(initial);
    closeColorPicker();
  };

  drawSwatches();
  drawRecents();
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
