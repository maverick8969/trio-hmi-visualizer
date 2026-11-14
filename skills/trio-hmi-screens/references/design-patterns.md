# HMI design patterns for Trio panels

## Screen layout (1024 × 600)

```
y=0    ┌──────────────────────────────────────────────────────────┐
       │ header (56)   title                         status/clock │
y=68   ├───────────────────────────┬──────────────────────────────┤
       │ panel: commands + lamps   │ panel: setpoints / readouts  │
       │                           │                              │
y=516  ├───────────────────────────┴──────────────────────────────┤
y=528  │ navbar (60): MAIN │ JOG │ SETUP │ ALARMS                  │
y=600  └──────────────────────────────────────────────────────────┘
```

- 16 px outer margin, 16 px between panels, 12–16 px inside panels. Snap to an 8 px grid.
- Two columns (≈480 px each) or a 600 / 376 split. Keep the navbar position identical on every page (use the spec-level `nav`).
- For 800 × 480: header 48, navbar 56, fonts one step smaller, at most ~8 controls per page.
- Row height 52 for numeric/readout rows (48 minimum), 80–128 for primary command buttons.

## Size and type

| Element | Size |
|---|---|
| Primary command (START/STOP) | ≥ 120 × 80 |
| Normal button, nav button | ≥ 96 × 56 (absolute minimum 48 × 48) |
| Jog buttons | ≥ 200 × 100 — gloved, hold-to-run |
| Gap between touch targets | ≥ 8 px (16 between START and STOP) |
| Captions | 16–18 px; values 20–28 px; titles 24–28 bold |

## Colour

State is the only reason for saturated colour (ISA-101 style): neutral greys for normal surfaces and idle lamps, then

- green `@ok` — running / enabled / healthy
- amber `@warn` — warning, attention, interlock active
- red `@alarm` — fault, E-stop, STOP button
- blue `@accent` — live values, selection, info (HOMED, current page)

Text on a lamp must be readable in both its on and off colour (white on dark-grey off / green / red / blue works; on amber use a darker amber like `#B45309` or dark text). Never signal state by colour alone — the lamp also carries a word.

## Patterns (spec snippet → controller side)

Controller snippets are Trio BASIC; `SET_BIT/CLEAR_BIT/READ_BIT(bit, vr)` operate on VR bits.

### One-shot command (START / STOP / RESET)
```json
{ "widget": "command", "name": "btnStart", "x": 32, "y": 164, "w": 140, "h": 84, "text": "START", "set": "VR(10).0", "back": "@ok" }
{ "widget": "lamp", "name": "lmpRun", "x": 32, "y": 104, "w": 140, "h": 44, "status": "VR(11).0", "text": "RUNNING" }
```
```basic
IF READ_BIT(0, 10) THEN            ' START requested
  CLEAR_BIT(0, 10)                 ' acknowledge: clear the one-shot command
  IF READ_BIT(1, 11) = 0 THEN SET_BIT(0, 11)   ' RUNNING unless FAULT
ENDIF
```
Sim: `{ "if": "VR(10).0 = 1", "set": { "VR(11).0": "VR(11).1 = 0", "VR(10).0": 0 } }`

### Latching option (vacuum, coolant, enable)
`toggle` widget — the strip under the button shows the bit. If the controller can refuse the option, show a separate status lamp bound to the controller's feedback bit instead.

### Hold-to-run jog
```json
{ "widget": "momentary", "name": "btnJogPos", "x": 324, "y": 180, "w": 276, "h": 128, "text": "JOG +", "bit": "VR(12).0" }
```
```basic
BASE(0)
IF READ_BIT(0, 12) AND RUN_STATE = 0 THEN
  SPEED = VR(103) : FORWARD
ELSE
  CANCEL
ENDIF
```
Also stop jog in the controller if the HMI link drops (watchdog: HMI toggles a heartbeat bit, controller times it out).

### Setpoint entry
```json
{ "widget": "numeric", "name": "txtSpeed", "x": 528, "y": 108, "w": 464, "h": 52, "label": "Speed setpoint", "bind": "VR(100)", "units": "mm/s", "dp": 1 }
```
The keypad writes straight into the VR. Clamp in the controller (`VR(100) = MIN(MAX(VR(100), 0), 500)`), or use a separate "requested" VR the controller validates and copies. Show limits in the caption or a hint label.

### Live readout
`readout` widget bound to a VR the controller updates (`VR(102) = MPOS AXIS(0)` in a fast loop). Scale with a binding like `VR(102)/1000` only for display.

### Alarm banner
```json
{ "widget": "alarm", "x": 32, "y": 368, "w": 448, "h": 56, "when": "VR(11).1", "text": "DRIVE FAULT — press RESET" }
```
For several alarms, stack banners at the same position with mutually exclusive `when` expressions in priority order, or one banner per alarm on an ALARMS page.

### Multi-state graphic
PictureBox with `images: ["valve_closed.png", "valve_open.png", "valve_fault.png"]` and `bind: "VR(40)"` (0/1/2). Put the PNGs next to the spec or in `imageDirs`.

### Mode-dependent controls
`"visible": "VR(15) = 1"` hides a control unless the machine is in that mode. Prefer showing the control disabled with an explanatory lamp ("RUNNING — JOG DISABLED") so operators know why nothing happens.

### Navigation
Spec-level `nav` puts the same navbar on every page and highlights the current one. Put a BACK/HOME button in the same corner on sub-pages if there is no navbar.

## Page checklist

- [ ] Every button's effect is visible: a lamp, readout, banner or page change responds (check_preview reports buttons that change nothing).
- [ ] Every command has a matching status indication driven by the controller.
- [ ] Every input shows units and the current value.
- [ ] STOP is red, large, and never next to START without a gap.
- [ ] No text is clipped at the target font sizes (look at the screenshots).
- [ ] VR_MAP.md has a description for every address.
