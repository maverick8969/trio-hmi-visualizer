#!/bin/bash
# Trio HMI Visualizer + Simulator launcher (macOS / Linux).
# Serves the folder over HTTP and opens it in your browser. HTTP is needed so
# the simulator can fetch the bundled sample programs + Live HMI screens (browsers
# block those fetches when a page is opened directly as a file:// URL).
cd "$(dirname "$0")"
PORT="${1:-8000}"
URL="http://localhost:$PORT/index.html"
echo "Serving Trio HMI Visualizer + Simulator at:"
echo "    $URL"
echo "Press Ctrl+C to stop."

# open the browser a moment after the server starts
( sleep 1
  if command -v open >/dev/null 2>&1; then open "$URL"
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"
  fi ) &

if command -v python3 >/dev/null 2>&1; then exec python3 -m http.server "$PORT"
elif command -v python >/dev/null 2>&1; then exec python -m http.server "$PORT"
elif command -v npx >/dev/null 2>&1; then exec npx --yes serve -l "$PORT" .
else
  echo "No python3 or node/npx found to run a local server."
  echo "You can still open index.html directly and use the 'Load Folder' button"
  echo "to pick the samples/line2 folder manually."
fi
