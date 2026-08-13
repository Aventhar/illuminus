import { MODULE_ID, STYLE_ATTR, log } from "./constants.mjs";
import { GROUPS } from "./style-schema.mjs";
import { getStyle } from "./style-store.mjs";

/**
 * An Illuminus menu in the journal text editor.
 *
 * The blocks and picture treatments are only reachable by hand-typing
 * `<blockquote class="illuminus-block illuminus-block--block01">` without this,
 * which rules out everyone the module is for. This adds a drop-down listing
 * them by whatever the current style calls them, wrapping the selection or
 * retagging the picture the cursor is in.
 *
 * Nothing new is introduced into the document schema: a block rides on
 * `blockquote` and a picture treatment on `figure`, both of which the editor
 * already understands, and Foundry's attribute capture preserves the classes
 * through a save-and-reload round trip.
 */

/** Class marking a block, alongside `illuminus-block--<key>`. */
export const BLOCK_CLASS = "illuminus-block";

/** Class marking a picture treatment, alongside `illuminus-picture--<key>`. */
export const PICTURE_CLASS = "illuminus-picture";

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

/** Merge a class onto whatever classes a node already carries. */
function withClasses(existing, added) {
  const kept = String(existing ?? "").split(/\s+/).filter((c) => c && !/^illuminus-(block|picture)/.test(c));
  return [...kept, ...added].join(" ").trim();
}

/** Strip only the classes this module manages, leaving the author's alone. */
function withoutClasses(existing) {
  return String(existing ?? "").split(/\s+/)
    .filter((c) => c && !/^illuminus-(block|picture)/.test(c)).join(" ").trim();
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
  const classes = [BLOCK_CLASS, `${BLOCK_CLASS}--${groupId}`];
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
  const classes = [PICTURE_CLASS, `${PICTURE_CLASS}--${groupId}`];
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

/** Take Illuminus's classes off the block or picture the cursor is in. */
function clearStyling() {
  return (state, dispatch) => {
    const target = ancestorOfType(state, "blockquote") ?? ancestorOfType(state, "figure");
    if (!target) return false;
    if (!/illuminus-(block|picture)/.test(target.node.attrs.classes ?? "")) return false;
    if (dispatch) {
      dispatch(state.tr.setNodeMarkup(target.pos, null, {
        ...target.node.attrs,
        classes: withoutClasses(target.node.attrs.classes)
      }));
    }
    return true;
  };
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

    config[MODULE_ID] = {
      action: MODULE_ID,
      title: game.i18n.localize("ILLUMINUS.Menu.Title"),
      cssClass: "illuminus-menu",
      entries: [
        {
          action: "illuminus-blocks",
          title: game.i18n.localize("ILLUMINUS.Menu.Blocks"),
          children: membersOf("blocks").map((groupId) => ({
            action: `illuminus-${groupId}`,
            title: labelFor(style, groupId),
            active: isActive(state, "blockquote", groupId, BLOCK_CLASS),
            cmd: applyBlock(groupId)
          }))
        },
        {
          action: "illuminus-pictures",
          title: game.i18n.localize("ILLUMINUS.Menu.Pictures"),
          children: membersOf("pictures").map((groupId) => ({
            action: `illuminus-${groupId}`,
            title: labelFor(style, groupId),
            active: isActive(state, "figure", groupId, PICTURE_CLASS),
            cmd: applyPicture(groupId)
          }))
        },
        {
          action: "illuminus-clear",
          title: game.i18n.localize("ILLUMINUS.Menu.Clear"),
          cmd: clearStyling()
        }
      ]
    };
  });

  log.debug("journal editor menu registered");
}
