# Using the simulator from the Line 2 controller repo

These files let Claude Code agents working **in the Line 2 repo** boot the simulator against that
repo's own `.BAS` code, check VR outputs, and screenshot the HMI.

## Install (once, in the Line 2 repo)

1. Copy `.claude/settings.json` from this folder into the Line 2 repo root (merge it into an existing
   `.claude/settings.json` if there is one). It registers this repo as the `trio-tools` plugin
   marketplace and enables the `trio-sim` plugin for everyone who opens the repo.
2. Append `CLAUDE.md.snippet` to the Line 2 repo's `CLAUDE.md` (create it if missing). That tells agents
   *when* to run the sim, not just how.
3. Optional: add `sim/scenarios.json` in the Line 2 repo with line-specific regression scenarios
   (format in `skills/trio-sim/SKILL.md`).
4. Commit and push.

The first time someone opens the Line 2 repo in Claude Code, they're asked to trust the marketplace
and install the plugin. Manual install instead:

```
/plugin marketplace add maverick8969/trio-hmi-visualizer
/plugin install trio-sim@trio-tools
```

## Cloud sessions (claude.ai/code)

- If `trio-hmi-visualizer` is **private**, the cloud session needs GitHub access to it as well as to the
  Line 2 repo. Add both repos to the session (or to its environment); the skill's fallback clones it.
- `trio-sim` needs only Node. `hmi-shot` needs Playwright + Chromium, which cloud containers already have.

## Pinning

`.claude/settings.json` pins the marketplace to the `v0.1.0` tag, so Line 2 agents don't pick up
unfinished simulator changes:

```json
"source": { "source": "github", "repo": "maverick8969/trio-hmi-visualizer", "ref": "v0.1.0" }
```

To upgrade: bump `version` in `.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json` here,
tag the release (`git tag v0.2.0 && git push origin v0.2.0`), then change `ref` in the Line 2 repo.
For CI, pass the same tag as `ref:` on the `actions/checkout` step that fetches this repo.

## CI without Claude

The CLI is plain Node, so a Line 2 GitHub Actions job can run it directly:

```yaml
- uses: actions/checkout@v4
- uses: actions/checkout@v4
  with: { repository: maverick8969/trio-hmi-visualizer, ref: v0.1.0, path: .trio }
- run: node .trio/tools/trio-sim.js --bas . --parse-only
- run: node .trio/tools/trio-sim.js --bas . --scenario all
```
