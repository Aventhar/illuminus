/**
 * Color conversion, and sampling colors out of the page.
 *
 * Kept apart from the GUI because both the style editor's eyedropper button and
 * the color picker's own need the same behaviour, and because these are the
 * pieces worth testing directly.
 */

/* -------------------------------------------- */
/*  Conversion                                  */
/* -------------------------------------------- */

/**
 * Convert a computed `rgb()` / `rgba()` color to hex, keeping any alpha.
 * @param {string} value
 * @returns {string|null} `#rrggbb`, or `#rrggbbaa` when not fully opaque.
 */
export function cssToHex(value) {
  const parts = String(value).match(/[\d.]+/g);
  if (!parts || parts.length < 3) return null;
  const [r, g, b, a = 1] = parts.map(Number);
  return rgbaToHex({ r, g, b, a });
}

/** Two hex digits for a 0-255 channel. */
const pair = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");

/**
 * @param {{r: number, g: number, b: number, a?: number}} rgba
 * @returns {string} `#rrggbb`, or `#rrggbbaa` when not fully opaque.
 */
export function rgbaToHex({ r, g, b, a = 1 }) {
  const rgb = `#${pair(r)}${pair(g)}${pair(b)}`;
  return a >= 1 ? rgb : `${rgb}${pair(a * 255)}`;
}

/**
 * Parse any hex form the controls accept: 3, 4, 6, or 8 digits.
 * @param {string} hex
 * @returns {{r: number, g: number, b: number, a: number}|null}
 */
export function hexToRgba(hex) {
  const clean = String(hex).trim().replace(/^#/, "");
  if (!/^[0-9a-f]+$/i.test(clean)) return null;
  const expand = (s) => parseInt(s.length === 1 ? s + s : s, 16);
  if (clean.length === 3 || clean.length === 4) {
    return {
      r: expand(clean[0]), g: expand(clean[1]), b: expand(clean[2]),
      a: clean.length === 4 ? expand(clean[3]) / 255 : 1
    };
  }
  if (clean.length === 6 || clean.length === 8) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
      a: clean.length === 8 ? parseInt(clean.slice(6, 8), 16) / 255 : 1
    };
  }
  return null;
}

/**
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {{h: number, s: number, v: number}} h in degrees, s and v in 0..1.
 */
export function rgbToHsv({ r, g, b }) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

/**
 * @param {{h: number, s: number, v: number}} hsv
 * @returns {{r: number, g: number, b: number}}
 */
export function hsvToRgb({ h, s, v }) {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  const [r, g, b] = h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/**
 * @param {{r: number, g: number, b: number}} rgb
 * @returns {{h: number, s: number, l: number}} h in degrees, s and l in 0..100.
 */
export function rgbToHsl({ r, g, b }) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const d = max - min;
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (d) {
    s = d / (1 - Math.abs(2 * l - 1));
    if (max === R) h = ((G - B) / d) % 6;
    else if (max === G) h = (B - R) / d + 2;
    else h = (R - G) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: s * 100, l: l * 100 };
}

/**
 * @param {{h: number, s: number, l: number}} hsl  s and l in 0..100.
 * @returns {{r: number, g: number, b: number}}
 */
export function hslToRgb({ h, s, l }) {
  const S = s / 100;
  const L = l / 100;
  const c = (1 - Math.abs(2 * L - 1)) * S;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = L - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x];
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

/** Whether a hex value paints nothing. Only eight digits carry alpha. */
export function isInvisible(hex) {
  return typeof hex === "string" && hex.length === 9 && hex.endsWith("00");
}

/* -------------------------------------------- */
/*  Sampling from the page                      */
/* -------------------------------------------- */

/**
 * The color under a point, and what kind of color it is.
 *
 * Order matters: a border is painted inside the element's border box, so
 * pointing at the line itself must yield the border color rather than the fill
 * behind it.
 *
 * @param {number} x
 * @param {number} y
 * @param {boolean} wantText  Take the lettering color instead.
 * @returns {{hex: string, mode: "border"|"text"|"fill"}|null}
 */
export function sampleAt(x, y, wantText) {
  const element = document.elementFromPoint(x, y);
  if (!element) return null;

  if (wantText) {
    const hex = cssToHex(getComputedStyle(element).color);
    return hex ? { hex, mode: "text" } : null;
  }

  const border = borderAt(element, x, y);
  if (border) return border;

  for (let node = element; node instanceof Element; node = node.parentElement) {
    const hex = cssToHex(getComputedStyle(node).backgroundColor);
    if (hex && !isInvisible(hex)) return { hex, mode: "fill" };
  }
  return null;
}

/**
 * Whether a point falls on one of an element's borders, and that border's
 * color. Hit testing already guarantees the point is inside the border box, so
 * this only has to work out which band it lands in.
 * @returns {{hex: string, mode: "border"}|null}
 */
function borderAt(element, x, y) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const sides = {
    Top: y <= rect.top + parseFloat(style.borderTopWidth),
    Right: x >= rect.right - parseFloat(style.borderRightWidth),
    Bottom: y >= rect.bottom - parseFloat(style.borderBottomWidth),
    Left: x <= rect.left + parseFloat(style.borderLeftWidth)
  };
  for (const [side, isOn] of Object.entries(sides)) {
    if (!isOn) continue;
    if (parseFloat(style[`border${side}Width`]) <= 0) continue;
    if (style[`border${side}Style`] === "none") continue;
    const hex = cssToHex(style[`border${side}Color`]);
    if (hex && !isInvisible(hex)) return { hex, mode: "border" };
  }
  return null;
}

/**
 * Point at anything in the window to take its color.
 *
 * Reads colors out of the page rather than off the screen: the operating
 * system's sampler and the browser's EyeDropper API both depend on screen
 * capture, which is not available on every machine, and neither keeps alpha.
 *
 * @returns {Promise<string|null>} The chosen color, or null if canceled.
 */
export function pickFromWindow() {
  return new Promise((resolve) => {
    const readout = document.createElement("div");
    readout.className = "illuminus-picker-readout";
    document.body.append(readout);
    document.documentElement.classList.add("illuminus-picking");

    const MODE_LABEL = {
      border: "ILLUMINUS.Picker.BorderMode",
      text: "ILLUMINUS.Picker.TextMode",
      fill: "ILLUMINUS.Picker.BackgroundMode"
    };

    let current = null;
    let wantText = false;
    let lastX = 0;
    let lastY = 0;

    const update = () => {
      const sample = sampleAt(lastX, lastY, wantText);
      current = sample?.hex ?? null;
      readout.style.left = `${lastX + 16}px`;
      readout.style.top = `${lastY + 16}px`;
      readout.innerHTML = `<span class="illuminus-picker-swatch" style="background:${current ?? "transparent"}"></span>`
        + `<span>${current ?? "—"}</span>`
        + `<span class="illuminus-picker-mode">${sample ? game.i18n.localize(MODE_LABEL[sample.mode]) : ""}</span>`;
    };

    const onMove = (event) => {
      lastX = event.clientX;
      lastY = event.clientY;
      wantText = event.altKey;
      update();
    };

    // Capture phase, so pointing at a button samples it rather than pressing it.
    const onClick = (event) => {
      event.preventDefault();
      event.stopPropagation();
      finish(current);
    };

    const onKey = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish(null);
      } else if (event.key === "Alt") {
        wantText = true;
        update();
      }
    };

    const onKeyUp = (event) => {
      if (event.key === "Alt") {
        wantText = false;
        update();
      }
    };

    function finish(value) {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("keyup", onKeyUp, true);
      document.documentElement.classList.remove("illuminus-picking");
      readout.remove();
      resolve(value);
    }

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("keyup", onKeyUp, true);
    update();
  });
}
