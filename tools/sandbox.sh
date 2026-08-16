#!/usr/bin/env bash
#
# Build and run a throwaway Foundry instance for testing Illuminus.
#
# This exists so tests never touch a live world. Running a second Foundry server
# against a data directory the desktop app already has open makes the two
# contend for the LevelDB locks and can trigger a database repair on the real
# world. The sandbox gets its own dataPath and its own port; only the module and
# the game system are symlinked in, and the license config is copied.
#
# Usage:
#   tools/sandbox.sh up        create (if needed) and start the sandbox
#   tools/sandbox.sh down      stop the sandbox server and browser
#   tools/sandbox.sh reset     delete the sandbox world data, then start fresh
#
# Override with environment variables:
#   FOUNDRY_APP    path to the Foundry application resources
#   FOUNDRY_DATA   your real data directory, used only to copy Config and to
#                  symlink the game system
#   SANDBOX_DIR    where to build the throwaway data directory
#   PORT           port for the sandbox server (default 30002)
#   SYSTEM         game system id to link in (default: whichever is installed)

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FOUNDRY_APP="${FOUNDRY_APP:-/Applications/Foundry Virtual Tabletop.app/Contents/Resources/app}"
FOUNDRY_DATA="${FOUNDRY_DATA:-$HOME/Documents/FoundryVTT}"
SANDBOX_DIR="${SANDBOX_DIR:-${TMPDIR:-/tmp}/illuminus-sandbox}"
PORT="${PORT:-30002}"
# Whichever game system is installed, rather than a named one: the sandbox needs
# *a* system to make a world with, and naming a particular one in the repository
# says something about this module that is not true — it works with any of them.
SYSTEM="${SYSTEM:-$(ls "${FOUNDRY_DATA:-$HOME/Documents/FoundryVTT}/Data/systems" 2>/dev/null \
  | grep -v '^README' | head -1)}"
WORLD="illuminus-sandbox"
# Taken from the installed Foundry rather than written down: a world built for
# an older build will not auto-launch after an update — it wants a migration
# nobody is there to confirm — and the failure looks like a broken sandbox
# rather than like Foundry having moved on.
CORE_VERSION="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1] + "/package.json"))["version"].rsplit(".", 1)[0])' "$FOUNDRY_APP" 2>/dev/null || echo 14)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
CDP_PORT="${CDP_PORT:-9222}"

die() { echo "error: $*" >&2; exit 1; }

build() {
  [ -d "$FOUNDRY_APP" ] || die "Foundry not found at $FOUNDRY_APP (set FOUNDRY_APP)"
  [ -d "$FOUNDRY_DATA/Data/systems/$SYSTEM" ] || die "system '$SYSTEM' not found under $FOUNDRY_DATA"

  mkdir -p "$SANDBOX_DIR"/{Config,Logs,Data/{modules,systems,worlds}}
  cp "$FOUNDRY_DATA"/Config/*.json "$SANDBOX_DIR/Config/" 2>/dev/null || true

  python3 - "$SANDBOX_DIR" "$PORT" <<'PY'
import json, sys, pathlib
sandbox, port = sys.argv[1], int(sys.argv[2])
p = pathlib.Path(sandbox) / "Config" / "options.json"
o = json.loads(p.read_text()) if p.exists() else {}
o.update({"dataPath": sandbox, "port": port, "world": None, "hotReload": False, "upnp": False})
p.write_text(json.dumps(o, indent=2))
PY

  ln -sfn "$REPO" "$SANDBOX_DIR/Data/modules/illuminus"
  ln -sfn "$FOUNDRY_DATA/Data/systems/$SYSTEM" "$SANDBOX_DIR/Data/systems/$SYSTEM"

  mkdir -p "$SANDBOX_DIR/Data/worlds/$WORLD"
  cat > "$SANDBOX_DIR/Data/worlds/$WORLD/world.json" <<EOF
{
  "id": "$WORLD",
  "title": "Illuminus Sandbox",
  "system": "$SYSTEM",
  "coreVersion": "$CORE_VERSION",
  "description": "Disposable world for automated Illuminus tests. Safe to delete.",
  "compatibility": { "minimum": "14", "verified": "$CORE_VERSION" }
}
EOF
  echo "sandbox built at $SANDBOX_DIR"
}

start() {
  lsof -ti:"$PORT" >/dev/null 2>&1 && die "port $PORT already in use — run 'tools/sandbox.sh down' first"

  # Fully detached: closing stdin and disowning keeps the caller's shell from
  # waiting on these, which otherwise hangs any non-interactive runner.
  ( cd "$FOUNDRY_APP" && nohup node main.mjs \
      --dataPath="$SANDBOX_DIR" --port="$PORT" --world="$WORLD" --headless --noupnp \
      > "$SANDBOX_DIR/foundry.log" 2>&1 < /dev/null & disown )

  # SwiftShader supplies software WebGL; without it Foundry's PixiJS init throws
  # and the client never reaches the join screen in headless Chrome.
  rm -rf "$SANDBOX_DIR/chrome-profile"
  nohup "$CHROME" --headless=new --remote-debugging-port="$CDP_PORT" \
    --user-data-dir="$SANDBOX_DIR/chrome-profile" --no-first-run --no-default-browser-check \
    --use-gl=angle --use-angle=swiftshader --enable-unsafe-swiftshader \
    --ignore-gpu-blocklist --enable-webgl --window-size=1600,1000 \
    `# The export opens a window to print from, which a person's browser allows
     # because they asked for it. Without this the check for that path has
     # nothing to check.` \
    --disable-popup-blocking \
    about:blank > "$SANDBOX_DIR/chrome.log" 2>&1 < /dev/null & disown

  for _ in $(seq 1 60); do
    if grep -q "Server started" "$SANDBOX_DIR/foundry.log" 2>/dev/null \
       && curl -sf "http://127.0.0.1:$CDP_PORT/json/version" >/dev/null 2>&1; then
      echo "sandbox up: Foundry on $PORT, Chrome CDP on $CDP_PORT"
      echo "run:  node tools/test-in-app.mjs"
      return 0
    fi
    sleep 1
  done
  die "sandbox failed to start — see $SANDBOX_DIR/foundry.log"
}

down() {
  pkill -f "remote-debugging-port=$CDP_PORT" 2>/dev/null || true
  pkill -f "main.mjs --dataPath=$SANDBOX_DIR" 2>/dev/null || true
  # Wait for the port to actually free: the process takes a moment to let go,
  # and "reset" would otherwise try to start on a port still held.
  for _ in $(seq 1 30); do
    lsof -ti:"$PORT" >/dev/null 2>&1 || break
    sleep 1
  done
  echo "sandbox stopped"
}

case "${1:-up}" in
  up)    build; start ;;
  down)  down ;;
  reset) down; rm -rf "${SANDBOX_DIR:?}/Data/worlds/$WORLD/data"; build; start ;;
  *)     die "usage: tools/sandbox.sh [up|down|reset]" ;;
esac
