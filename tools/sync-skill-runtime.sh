#!/bin/bash
# Copy the visualizer's runtime modules into the portable skill so its
# generated preview.html renders TGD files with exactly the same engine.
# Run after changing any of these files in js/.
set -euo pipefail
cd "$(dirname "$0")/.."
DEST=skills/trio-hmi-screens/assets/runtime
for f in utils.js vr-store.js binding-engine.js tgd-parser.js image-store.js renderers.js action-handler.js; do
  cp "js/$f" "$DEST/$f"
done
echo "Synced runtime into $DEST"
