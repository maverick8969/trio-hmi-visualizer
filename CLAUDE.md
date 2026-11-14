# trio-hmi-visualizer

Browser HMI visualizer (`index.html`, `js/*.js`) and Trio controller simulator (`js/sim/*`) for
Trio Motion `.TGD/.TGM` screens and TrioBASIC `.BAS` programs. No build step, no runtime dependencies.
Docs: `README.md`, `SIMULATOR.md`, `docs/simulator/`.

## Layout

- `js/sim/trio-{lexer,parser,runtime,machine,plant}.js`: the engine. UMD modules, loaded by both the browser and Node.
- `js/sim/sim-scenarios.js`: declarative scenario/assertion harness and the built-in regression scenarios.
- `tools/trio-sim.js`: headless CLI (JSON output) that agents and CI use. `tools/hmi-shot.js`: Playwright HMI screenshots.
- `tools/lib/sim-node.js`: builds a Node sim from any `.BAS` folder (autorun detection, recursive search).
- `skills/` + `.claude-plugin/`: this repo is also a Claude Code plugin marketplace (`trio-tools`, plugin `trio-sim`)
  so other repos, mainly the Line 2 controller repo, can use these skills. See `integrations/line2/`.
- `samples/line2`, `samples/line2-hmi`: a snapshot of the Line 2 project used for tests and demos.

## Working here

- Test: `npm test` (runs every `tests/test-*.js`; no install needed).
- Keep engine files dependency-free and UMD-compatible (they must load via `<script>` and `require`).
- If you change CLI flags or output shape, update `skills/*/SKILL.md` and `tests/test-cli.js` in the same change,
  because downstream agents rely on them.
- Bump `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` when the skills or CLI change
  in a way downstream users should pick up. Validate with `claude plugin validate .`.
