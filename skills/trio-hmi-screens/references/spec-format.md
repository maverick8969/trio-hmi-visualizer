# HMI spec format (`*.hmi.json`)

One JSON file describes a whole HMI project. `trio_hmi.py build` turns it into TGD pages, `preview.html` and `VR_MAP.md`.

```jsonc
{
  "project": { "name": "Cell1", "width": 1024, "height": 600, "startup": "MAIN" },
  "theme":   { "base": "dark", "colors": { "accent": "#0EA5E9" }, "font": "DejaVu Sans" },
  "refresh": 250,                       // default binding refresh period (ms) for every page
  "vars":    { "VR(10).0": "START", "VR(100)": "Speed setpoint (mm/s)" },  // descriptions
  "nav":     { "x": 16, "y": 528, "w": 992, "h": 60,
               "items": [ { "text": "MAIN", "page": "MAIN" }, { "text": "SETUP", "page": "SETUP" } ] },
  "imageDirs": ["images"],              // folders (relative to the spec) holding PictureBox images
  "pages": [
    { "name": "MAIN", "back": "@bg", "refresh": 250, "nav": true, "components": [ ... ] }
  ],
  "sim": { "tick": 100, "init": { ... }, "rules": [ ... ] }
}
```

- `project.width/height` — screen resolution in px (all pages share it).
- `nav` — optional; a `navbar` widget is inserted on every page with the current page highlighted (its button has no action). Set `"nav": false` on a page to omit it.
- Page `name` must be an identifier; it becomes `<name>.TGD` and the `GotoPage` target.

## Colours

`"#RRGGBB"`, `"#AARRGGBB"` (alpha first — Trio format), `"transparent"`, or a theme token `"@name"`.

Theme tokens (override any in `theme.colors`):

| token | dark | light | use |
|---|---|---|---|
| `@bg` | #1B232D | #E9ECEF | page background |
| `@panel` / `@edge` | #26313D / #3A4756 | #FFFFFF / #ADB5BD | panel fill / border, dividers |
| `@header` / `@headerText` | #111820 / #E6EDF3 | #343A40 / #FFFFFF | title bar / its text |
| `@text` / `@muted` | #E6EDF3 / #9AA7B4 | #212529 / #6C757D | text / captions, units |
| `@accent` | #2F81F7 | #0D6EFD | live values, info, selection |
| `@ok` `@warn` `@alarm` | green / amber / red | | running / warning / fault |
| `@off` | #3A4756 | #6C757D | lamp off (white lamp text stays readable) |
| `@inputBg` `@inputText` | | | editable value boxes |
| `@button` `@buttonText` `@navActive` | | | buttons, current nav page |

## Fonts

`"DejaVu Sans:20:1"` (family:size:style, style bit 1 = bold, 2 = italic), a number (size), or `{ "size": 20, "bold": true, "italic": false, "family": "DejaVu Sans" }`. DejaVu Sans is what the Trio HMI client ships with — keep it unless the user's panel has other fonts installed.

## Primitive components

Every component: `type`, `x`, `y`, `w`, `h`, optional `name` (auto-named `lbl1`, `btn2`, … if omitted).

| `type` | Extra keys | Main binding (`bind`) |
|---|---|---|
| `Label` | `text`, `font`, `fore`, `back` (default transparent), `align` (ContentAlignment: `TopLeft` … `MiddleCenter` … `BottomRight`, default `MiddleLeft`), `format` (`text`/`integer`/`real`), `dp`, `width` | `Text` (read-only) |
| `TextBox` | as Label but `align` is `Left`/`Center`/`Right` (default `Right`), `border` (`FixedSingle`/`None`), `min` / `max` (keypad rejects values outside), `keypad` (default true), `keypadKind`, `editable` (default true) | `Text` — `ReadWrite` (written on `LostFocus`) by default; a Click → `OpenKeyPad;INT_NUMPAD_ENTER;<name>` (integer format) or `REAL_NUMPAD_ENTER` is added automatically |
| `Button` | `text`, `font` (default bold), `fore`, `back`, `image` | `Text` (read-only) |
| `CheckBox` | `text`, `checked`, `editable` (default true) | `Checked` — `ReadWrite` by default, written on `CheckStateChanged` (tap toggles the bit) |
| `Rectangle` | `back`/`on` (colour when status true), `off` (`OffBackColour`, when false; defaults to `back`), `external` (`ExternalBackColour`, default `@bg`), `fore` (border; `transparent` = none) | `Status` |
| `Line` | `fore`, `thickness`, `orientation` (`Horizontal`/`Vertical`, inferred from w/h if omitted) | – |
| `PictureBox` | `image` (file name) or `images` (list → ImageList), `stretch` | `Status` (index into `images`) |

Common optional keys:

- `bind`: mcsource for the main property (see `bindings-actions.md`), `mode`: `ReadOnly` / `ReadWrite` to override.
- `bindings`: `{ "BackColor": "VR(30)", "Left": "VR(31)", "Visible": { "mcsource": "VR(5).0", "mode": "ReadOnly" } }` — bind any other property.
- `visible`: `true`/`false`, or an expression string → `Visible` binding (shown only while true).
- `onClick`, `onPress` (ButtonDown), `onRelease` (ButtonUp): one action or a list.
- `props`: raw extra properties, `{ "Thickness": 3 }` or `{ "Foo": { "type": "System.Int32", "value": 1 } }`.

## Actions

Strings are passed through verbatim (`"GotoPage;MAIN"`, `"Exec;VR(10).0=1"`). Shortcuts:

| Shortcut | Becomes |
|---|---|
| `{ "goto": "SETUP" }` | `GotoPage;SETUP` |
| `{ "set": "VR(10).0" }` / `{ "set": "VR(10).0", "value": 0 }` | `Exec;VR(10).0=1` / `=0` |
| `{ "set": "VR(5)", "value": "VR(5)+10" }` | `Exec;VR(5)=VR(5)+10` |
| `{ "toggle": "VR(20).1" }` | `Exec;VR(20).1=(VR(20).1 = 0)` |
| `{ "keypad": "txtSpeed" }` / `{ "keypad": "txtQty", "kind": "INT_NUMPAD_ENTER" }` | `OpenKeyPad;REAL_NUMPAD_ENTER;txtSpeed` / `OpenKeyPad;INT_NUMPAD_ENTER;txtQty` |
| `{ "exec": "VR(7)=0" }` | `Exec;VR(7)=0` |
| `{ "vs": "VR:543", "value": 1 }` | `VS;VR:543;1` |

## Widgets

Composite patterns. All take `x, y, w, h` and optional `name` (child components are named `<name>_lbl`, `<name>_lamp`, …).

| `widget` | Keys | Produces |
|---|---|---|
| `header` | `text`, `h` (56), `status: {text \| bind, format}`, `back`, `font` | full-width title bar (no x/y/w needed) |
| `navbar` | `items: [{text, page}]`, `gap`, `font`, `current` | GotoPage buttons; current page highlighted and inert |
| `panel` | `title`, `back`, `border` | framed group with caption |
| `lamp` | `status` (expr), `text`, `on` (`@ok`), `off` (`@off`), `fore`, `border` | Rectangle with Status binding + centred Label |
| `numeric` | `label`, `bind` (VR), `units`, `format` (`real`), `dp` (2), `min`, `max`, `labelW`, `unitsW`, `valueFont` | caption + keypad TextBox + units |
| `readout` | same as numeric, plus `fore`, `back` | caption + live read-only Label + units |
| `command` | `text`, `set` (target), `value` (1), `back`, `fore`, `onClick` (extra actions) | one-shot command button |
| `toggle` | `text`, `bit`, `on`, `off`, `lampH` (10) | latching button + state strip underneath |
| `momentary` | `text`, `bit`, `lamp` (true), `on` | hold-to-run button: ButtonDown → 1, ButtonUp → 0 |
| `stepper` | `bind` (VR), `step` (1), `format` (`integer`), `dp`, `min`, `max` (keypad only; clamp ± in the controller) | `[-]` keypad box `[+]` |
| `alarm` | `when` (expr), `text`, `back` (`@alarm`) | banner visible only while `when` is true |

## Simulation (`sim`) — preview only

Stands in for the controller program so the preview reacts like the machine. Not written into the TGDs.

```jsonc
"sim": {
  "tick": 100,                                  // ms between rule passes
  "init": { "VR(100)": 50, "VR(20).0": 1 },     // values at load and on Reset
  "rules": [
    { "if": "VR(10).0 = 1", "set": { "VR(11).0": "VR(11).1 = 0", "VR(10).0": 0 } },   // START latches RUNNING unless faulted
    { "if": "VR(11).0 = 1", "set": { "VR(101)": "VR(101) + (VR(100) - VR(101)) * 0.25" } },
    { "if": "VR(11).0 = 1", "every": 1000, "set": { "VR(104)": "VR(104) + 1" } }
  ]
}
```

- Rules run top to bottom every `tick`; `every` (ms) throttles a rule. Within a rule all `set` expressions are evaluated before any is written.
- Expressions: `VR(n)`, `VR(n).bit`, numbers, `+ - * / MOD ( )`, `= <> < > <= >=`, `AND OR NOT`, `TRUE FALSE`. Comparisons yield 1/0.
- Targets: `VR(n)` or `VR(n).bit`.
- The preview's **Sim** button pauses rules; **Reset** restores `init`. Any VR can be edited and any bit toggled from the side panel, e.g. to inject a fault.
