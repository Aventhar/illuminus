# Illuminus

An add-on module for [Foundry Virtual Tabletop](https://foundryvtt.com/).

- **Foundry compatibility:** v14 (minimum `14`, verified `14.365`)
- **Game system:** system-agnostic — uses core Foundry APIs only
- **Build step:** none. Plain ES modules and CSS, loaded directly by Foundry.

## Layout

```
module.json              Manifest — id, compatibility, entry points
lang/en.json             Localization strings (every user-facing string lives here)
scripts/module.mjs       Entry point; registers hooks and the public API
scripts/constants.mjs    Module id, setting keys, logger
scripts/settings.mjs     game.settings registration
scripts/apps/            ApplicationV2 windows
styles/illuminus.css     Styles, namespaced under .illuminus
templates/               Handlebars templates
```

## Development

The Foundry data directory already contains a symlink:

```
/Users/sean/Documents/FoundryVTT/Data/modules/illuminus -> /Users/sean/Local/Development/Illuminus
```

Edit files in this repo and they are live in Foundry immediately. `module.json`
declares hot reload for `styles/`, `templates/`, and `lang/`, so changes to CSS,
Handlebars, and localization apply without a page refresh — enable **Hot Reload**
in Foundry's setup options. Changes to `.mjs` files require a browser refresh
(F5).

Enable **Debug Logging** in the module settings to see `illuminus |` messages in
the browser console.

## Public API

```js
const illuminus = game.modules.get("illuminus").api;
illuminus.openPanel();
```

## Conventions

- Never hard-code the module id — import `MODULE_ID` from `scripts/constants.mjs`.
- Never hard-code user-facing text — add a key to `lang/en.json` and localize it.
- Register settings in `init`, read world documents no earlier than `ready`.
- Prefix every CSS class with `illuminus-` so styles cannot leak into core UI.
