---
name: trio-hmi-screens
description: Generate Trio Motion Technology HMI screens (.TGD pages for Motion Perfect / Trio HMI panels) plus an interactive HTML simulator where operators can press buttons, enter values on a keypad and watch lamps, readouts and alarms change. Use when the user asks to create, design, mock up, prototype, preview, validate or review a Trio HMI / TGD / TGM screen, an operator panel for a Trio Motion controller (MC4N, MC6N, Flex-6, etc.), or a touchscreen tied to VR registers. Also use to turn an existing set of .TGD files into a clickable preview or to lint them.
---

# Trio HMI screen generator

Produces three things from one JSON spec:

| Output | Purpose |
|---|---|
| `<PAGE>.TGD` per page | Deployable screen files (Trio `triomotion:hmi:tgd` XML) for Motion Perfect |
| `preview.html` | Single self-contained file: renders the TGDs with the same engine as the Trio HMI Visualizer, with working buttons, keypad entry, page navigation, a live VR panel and simulated controller logic |
| `VR_MAP.md` | Every VR address the HMI reads/writes, for whoever writes the controller program |

Everything lives in this skill's directory (`SKILL_DIR` below = the folder containing this file):
`scripts/trio_hmi.py` (Python 3.8+, stdlib only), `scripts/check_preview.cjs` (optional, needs Playwright),
`assets/runtime/` (simulator engine), `assets/examples/demo-cell.json` (complete 3-page example).

## Workflow

1. **Gather requirements** (ask only for what you cannot find):
   - Screen resolution — default `1024x600`. Others: `800x480`, `1280x800`.
   - Pages and what the operator does on each (run/stop, setpoints, jog, recipes, alarms, diagnostics).
   - **The VR address map.** Look in the repo first: Trio BASIC programs (`*.BAS`, `*.bas`, `*.TXT` in a Motion Perfect project), existing `.TGD` files, `VR_MAP.md`, docs. Never silently invent addresses for a real machine — if none exist, propose a block (e.g. command word `VR(10)`, status word `VR(11)`, setpoints from `VR(100)`) and state clearly in your reply that they are proposals.
   - Theme: `dark` (default) or `light`.

2. **Write the spec** `hmi/<project>.hmi.json` (or wherever the user wants). Read `references/spec-format.md` for the full schema and copy patterns from `assets/examples/demo-cell.json`. Prefer widgets (`header`, `navbar`, `panel`, `lamp`, `numeric`, `readout`, `toggle`, `momentary`, `command`, `stepper`, `alarm`) over raw components — they encode the operator patterns in `references/design-patterns.md`.

3. **Make it functional** with a `sim` block: `init` values and `rules` that mimic the controller program (latch START into RUNNING, clear one-shot command bits, ramp speed, count parts, jog position, raise/clear faults). If the repo has the real BASIC program, derive the rules from it. Without rules, buttons still write VRs and every bound component reacts, but status bits only change when the controller would set them — i.e. never in the preview.

4. **Build**
   ```bash
   python3 SKILL_DIR/scripts/trio_hmi.py build hmi/cell.hmi.json -o hmi/out
   ```
   Fix every `SPEC ERROR` / `ERROR`. Treat warnings as review items (touch targets < 40 px, overlapping inputs, off-screen components, actions the preview can't simulate). Add `--tgm` for a minimal project manifest stub.

5. **Verify** — do not skip. Check for Playwright with `node -e "require('playwright')"`. If it is missing, install it as a dev dependency (`npm i -D playwright && npx playwright install chromium`; on bare Linux add `--with-deps`) — ask first if the repo has no `package.json` or the user may not want new dependencies. Then:
   ```bash
   node SKILL_DIR/scripts/check_preview.cjs hmi/out/preview.html --shots hmi/out/shots
   ```
   It presses every button, enters a value in every input, reports dead buttons / broken keypads / JS errors, and screenshots each page. **Look at the screenshots** for clipped text, overlaps, low contrast and alignment. Iterate on the spec until clean. If Playwright can't be installed (offline, no Node), open `preview.html` in a browser and tell the user the automated check did not run.

6. **Deliver**: list the TGD files, `preview.html` (open it in any browser — no server needed) and `VR_MAP.md`. Remind the user to add the TGD pages to their Motion Perfect HMI project and confirm they open in the HMI designer before deploying to a machine (see Fidelity below).

### Working with existing TGD files
```bash
python3 SKILL_DIR/scripts/trio_hmi.py preview path/to/*.TGD -o preview.html [--sim sim.json] [--startup MAIN]
python3 SKILL_DIR/scripts/trio_hmi.py validate path/to/folder
```
`--sim` takes `{"vars": {...}, "init": {...}, "rules": [...]}` (same as the spec's `sim` + `vars`). Images referenced by PictureBox/Button are embedded if found next to the TGDs (or in `--images DIR`).

To edit an existing TGD by hand, read `references/tgd-format.md` first; keep property `<type>` strings exact.

## Rules that keep screens correct

- **Command vs status.** Buttons write *command* bits; lamps read *status* bits set by the controller. Don't bind a RUNNING lamp to the START bit — it would light even if the machine refused to start.
- One-shot commands (`command` widget) set a bit to 1; the controller clears it after acting. Latching options use `toggle`. Motion while held uses `momentary` (ButtonDown sets 1, ButtonUp sets 0) — never latch jog.
- Every editable value is a `TextBox` with a `ReadWrite` binding to a plain `VR(n)` (or `PROGRAM:` variable). Expressions like `VR(5)/10` are read-only.
- Touch targets ≥ 48 px (validator warns < 40). Keep ≥ 8 px between buttons. Fonts ≥ 16 px; values 20–28 px.
- Colour carries state only: grey/neutral when normal, green running, amber warning, red fault/stop, blue info/selected. Text on coloured fills must stay readable in both on and off states.
- Names: identifiers only (`btnStart`, `txtSpeed`), unique per page. Page names become file names (`MAIN.TGD`) and `GotoPage` targets.
- Spec order is painter's order (later = on top). The builder writes the TGD front-to-back and always puts rectangles behind lines behind content, matching how the visualizer and HMI layer components.

## Fidelity

The TGD vocabulary here (component types, property names/types, binding and action syntax) is taken from TGD files produced by Motion Perfect and is what the Trio HMI Visualizer parses. A few `<type>` names are inferred (e.g. `Status` as `System.Boolean` on rectangles); they live in the `PROP_TYPES` / `STATUS_TYPE` tables at the top of `trio_hmi.py` so they can be corrected in one place. The simulator evaluates VR / bit / arithmetic / comparison expressions and `GotoPage`, `Exec` assignments, `VS`, `OpenKeyPad`; other controller expressions (`MPOS AXIS(0)`, `IN(5)`, `TABLE`, `LOOKUP`) show their stored value (editable from the VR panel only if they are VRs). Say so when a screen relies on them.

## References (read as needed)

- `references/spec-format.md` — JSON spec schema: components, widgets, actions, theme, sim rules.
- `references/design-patterns.md` — layouts for common screens, colour/size rules, controller-side BASIC snippets for each pattern.
- `references/bindings-actions.md` — `mcsource` binding syntax, binding modes, event action strings, what the simulator supports.
- `references/tgd-format.md` — TGD/TGM XML structure, property types, colours, fonts, z-order (for hand edits).
