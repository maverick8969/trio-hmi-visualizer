#!/bin/bash
# Quick launcher — opens the visualizer in your default browser.
# Alternatively, just open index.html directly in your browser.
cd "$(dirname "$0")"
echo "Opening HMI Visualizer in browser..."
if command -v xdg-open &>/dev/null; then
  xdg-open index.html
elif command -v open &>/dev/null; then
  open index.html
else
  echo "Open index.html in your browser manually."
fi
