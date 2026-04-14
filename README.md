# Trio HMI Visualizer

A browser-based visualizer and editor for **Trio Motion Controller** HMI screen files (`.TGD` / `.TGM`). Preview, edit, and export your HMI screens without needing the Motion Perfect IDE.

**Zero dependencies. No install. Just open `index.html`.**

## Features

- **View mode** -- Render TGD screens exactly as they appear on the controller
- **Edit mode** -- Select, drag, resize, and modify components visually
- **VR Simulation** -- Manually set VR register values and watch bindings update live
- **Round-trip editing** -- Load a TGD, modify it, export valid TGD XML
- **Data binding engine** -- Evaluates VR expressions, bit access, arithmetic, TABLE lookups, PROGRAM variables
- **Virtual keypad** -- Number pad overlay for simulating operator input
- **Component palette** -- Add Labels, TextBoxes, Buttons, CheckBoxes, Rectangles, Lines, PictureBoxes
- **Multi-page support** -- Load an entire TGM project or multiple TGD files at once
- **Image support** -- Load PNG/JPG/GIF/BMP images alongside TGD files for PictureBox rendering
- **Zoom controls** -- Fit-to-window, 1:1, +/-, and Ctrl+scroll
- **Drag and drop** -- Drop TGD/TGM/image files directly onto the canvas

## Quick Start

Open `index.html` in any modern browser, or run `./start.sh`.

## Usage

1. Click **Load Files** or **Load Folder** to load `.TGD`, `.TGM`, and image files
2. Pages appear as tabs -- click to switch between screens
3. Toggle **Edit** mode to select, drag, and resize components
4. Use the **VR Simulation** panel to change register values and see bindings update live
5. Click **Export TGD** to download the modified screen file

## What is a TGD file?

`.TGD` files are XML-based screen definitions used by **Trio Motion Technology** controllers. Each `.TGD` represents one HMI screen page, while a `.TGM` file is the project manifest.

## Browser Requirements

Any modern browser with ES6 support (Chrome 60+, Firefox 55+, Edge 79+, Safari 12+).

## License

MIT
