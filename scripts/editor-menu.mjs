import { MODULE_ID, STYLE_ATTR, log } from "./constants.mjs";
import { GROUPS } from "./style-schema.mjs";
import { getStyle } from "./style-store.mjs";

/**
 * An Illuminus menu in the journal text editor.
 *
 * The blocks and picture treatments are only reachable by hand-typing
 * `<blockquote class="illuminus-box illuminus-box--box01">` without this,
 * which rules out everyone the module is for. This adds a drop-down listing
 * them by whatever the current style calls them, wrapping the selection or
 * retagging the picture the cursor is in.
 *
 * Nothing new is introduced into the document schema: a block rides on
 * `blockquote` and a picture treatment on `figure`, both of which the editor
 * already understands, and Foundry's attribute capture preserves the classes
 * through a save-and-reload round trip.
 */

/** Class marking a box, alongside `illuminus-box--<key>`. */
export const BOX_CLASS = "illuminus-box";

/** Class marking an image style, alongside `illuminus-image--<key>`. */
export const IMAGE_CLASS = "illuminus-image";

/** Class marking an inline treatment, alongside `illuminus-tag--<key>`. */
export const TAG_CLASS = "illuminus-tag";

/** Block and picture group ids, in schema order. */
const membersOf = (family) => GROUPS.filter((group) => group.family === family).map((group) => group.id);

/**
 * The style applying to the journal this editor sits in, so the menu can call a
 * block whatever that style calls it. The sheet carries the id as an attribute,
 * which is true of a popped-out page sheet as well.
 * @param {EditorView} view
 */
function styleForEditor(view) {
  const id = view?.dom?.closest?.(`[${STYLE_ATTR}]`)?.getAttribute(STYLE_ATTR);
  return id ? getStyle(id) : undefined;
}

/** What to call one block or picture treatment in the menu. */
function labelFor(style, groupId) {
  return style?.labels?.[groupId] || game.i18n.localize(`ILLUMINUS.Groups.${groupId}.label`);
}

/** Any class this module manages, on a node or on a mark. */
const MANAGED = /^illuminus-(box|image|tag)/;

/** Merge a class onto whatever classes a node already carries. */
function withClasses(existing, added) {
  const kept = String(existing ?? "").split(/\s+/).filter((c) => c && !MANAGED.test(c));
  return [...kept, ...added].join(" ").trim();
}

/** Strip only the classes this module manages, leaving the author's alone. */
function withoutClasses(existing) {
  return String(existing ?? "").split(/\s+/)
    .filter((c) => c && !MANAGED.test(c)).join(" ").trim();
}

/**
 * The nearest ancestor of the selection of a given type.
 * @returns {{node: Node, pos: number}|null}
 */
function ancestorOfType(state, typeName) {
  const { $from } = state.selection;
  for (let depth = $from.depth; depth > 0; depth--) {
    const node = $from.node(depth);
    if (node.type.name === typeName) return { node, pos: $from.before(depth) };
  }
  return null;
}

/* -------------------------------------------- */
/*  Commands                                    */
/* -------------------------------------------- */

/**
 * Put the selection in a block, or retag the block it is already in.
 * @param {string} groupId
 */
function applyBlock(groupId) {
  const classes = [BOX_CLASS, `${BOX_CLASS}--${groupId}`];
  return (state, dispatch) => {
    const existing = ancestorOfType(state, "blockquote");
    if (existing) {
      if (dispatch) {
        dispatch(state.tr.setNodeMarkup(existing.pos, null, {
          ...existing.node.attrs,
          classes: withClasses(existing.node.attrs.classes, classes)
        }));
      }
      return true;
    }
    const wrap = foundry.prosemirror.commands.wrapIn(state.schema.nodes.blockquote, { classes: classes.join(" ") });
    return wrap(state, dispatch);
  };
}

/**
 * Apply a treatment to the picture the cursor is in, wrapping a bare image in a
 * figure when it is not in one already.
 * @param {string} groupId
 */
function applyPicture(groupId) {
  const classes = [IMAGE_CLASS, `${IMAGE_CLASS}--${groupId}`];
  return (state, dispatch) => {
    const figure = ancestorOfType(state, "figure");
    if (figure) {
      if (dispatch) {
        dispatch(state.tr.setNodeMarkup(figure.pos, null, {
          ...figure.node.attrs,
          classes: withClasses(figure.node.attrs.classes, classes)
        }));
      }
      return true;
    }
    const wrap = foundry.prosemirror.commands.wrapIn(state.schema.nodes.figure, { classes: classes.join(" ") });
    return wrap(state, dispatch);
  };
}

/**
 * Tag the selected words. Unlike a block, an inline treatment is a mark, so it
 * needs words to attach to — with nothing selected there is nothing to tag, and
 * the command reports that rather than doing something invisible.
 * @param {string} groupId
 */
function applyTag(groupId) {
  const classes = [TAG_CLASS, `${TAG_CLASS}--${groupId}`].join(" ");
  return (state, dispatch) => {
    if (state.selection.empty) return false;
    const type = state.schema.marks.span;
    if (!type) return false;
    // Retag rather than nest: applying a second tag to the same words should
    // replace the first, not bury it.
    const tr = state.tr.removeMark(state.selection.from, state.selection.to, type)
      .addMark(state.selection.from, state.selection.to, type.create({ classes }));
    if (dispatch) dispatch(tr);
    return true;
  };
}

/** Whether the selection already carries a given inline treatment. */
function tagIsActive(state, groupId) {
  const { from, to, empty, $from } = state.selection;
  const type = state.schema.marks.span;
  if (!type) return false;
  const marks = empty ? $from.marks() : null;
  const has = (mark) => mark.type === type
    && String(mark.attrs.classes ?? "").split(/\s+/).includes(`${TAG_CLASS}--${groupId}`);
  if (marks) return marks.some(has);
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.marks?.some(has)) found = true;
  });
  return found;
}

/** Take Illuminus's classes off whatever the cursor or selection is in. */
function clearStyling() {
  return (state, dispatch) => {
    const type = state.schema.marks.span;
    const { from, to, empty } = state.selection;
    // An inline treatment first: it is the thing the selection is most directly
    // on, and clearing it should not silently strip the block around it.
    if (type && !empty && tagIsAnywhere(state)) {
      if (dispatch) dispatch(state.tr.removeMark(from, to, type));
      return true;
    }
    const target = ancestorOfType(state, "blockquote") ?? ancestorOfType(state, "figure");
    if (!target) return false;
    if (!MANAGED.test(target.node.attrs.classes ?? "")) return false;
    if (dispatch) {
      dispatch(state.tr.setNodeMarkup(target.pos, null, {
        ...target.node.attrs,
        classes: withoutClasses(target.node.attrs.classes)
      }));
    }
    return true;
  };
}

/** Whether any of the selected words carry one of this module's tags. */
function tagIsAnywhere(state) {
  const type = state.schema.marks.span;
  const { from, to } = state.selection;
  let found = false;
  state.doc.nodesBetween(from, to, (node) => {
    if (node.marks?.some((m) => m.type === type && MANAGED.test(m.attrs.classes ?? ""))) found = true;
  });
  return found;
}

/** Whether the selection already sits in a given block or treatment. */
function isActive(state, typeName, groupId, prefix) {
  const target = ancestorOfType(state, typeName);
  return Boolean(target?.node.attrs.classes?.split(/\s+/).includes(`${prefix}--${groupId}`));
}

/* -------------------------------------------- */
/*  Menu                                        */
/* -------------------------------------------- */

/** Register the drop-down. Called once from `init`. */
export function registerEditorMenu() {
  Hooks.on("getProseMirrorMenuDropDowns", (menu, config) => {
    const style = styleForEditor(menu.view);
    const state = menu.view.state;

    const illuminus = {
      action: MODULE_ID,
      title: game.i18n.localize("ILLUMINUS.Menu.Title"),
      cssClass: "illuminus-menu",
      entries: [
        {
          action: "illuminus-boxes",
          title: game.i18n.localize("ILLUMINUS.Menu.Blocks"),
          children: membersOf("boxStyles").map((groupId) => ({
            action: `illuminus-${groupId}`,
            title: labelFor(style, groupId),
            active: isActive(state, "blockquote", groupId, BOX_CLASS),
            cmd: applyBlock(groupId)
          }))
        },
        {
          action: "illuminus-images",
          title: game.i18n.localize("ILLUMINUS.Menu.Pictures"),
          children: membersOf("imageStyles").map((groupId) => ({
            action: `illuminus-${groupId}`,
            title: labelFor(style, groupId),
            active: isActive(state, "figure", groupId, IMAGE_CLASS),
            cmd: applyPicture(groupId)
          }))
        },
        {
          action: "illuminus-tags",
          title: game.i18n.localize("ILLUMINUS.Menu.Tags"),
          children: membersOf("tagStyles").map((groupId) => ({
            action: `illuminus-${groupId}`,
            title: labelFor(style, groupId),
            active: tagIsActive(state, groupId),
            cmd: applyTag(groupId)
          }))
        },
        {
          action: "illuminus-clear",
          title: game.i18n.localize("ILLUMINUS.Menu.Clear"),
          cmd: clearStyling()
        }
      ]
    };

    // The bar renders drop-downs in the order of this object's keys, so simply
    // assigning one puts it at the end. Rebuilding the object is the only way
    // to sit next to Format, where the controls that change what a passage *is*
    // belong, rather than out past the icon buttons.
    const ordered = {};
    for (const [key, value] of Object.entries(config)) {
      ordered[key] = value;
      if (key === "format") ordered[MODULE_ID] = illuminus;
    }
    if (!(MODULE_ID in ordered)) ordered[MODULE_ID] = illuminus;
    for (const key of Object.keys(config)) delete config[key];
    Object.assign(config, ordered);
  });

  log.debug("journal editor menu registered");
}
