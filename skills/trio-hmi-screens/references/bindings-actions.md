# Bindings and actions

## Property bindings (`<binding>`)

```xml
<property>
  <name>Text</name>
  <type>System.String</type>
  <value />
  <binding>
    <mcsource>VR:72</mcsource>
    <mode>ReadWrite</mode>
    <write_event>LostFocus</write_event>
  </binding>
</property>
```

The HMI client polls each `mcsource` every `bindingrefreshperiod` ms (page setting, default 250) and pushes the value into the property. `ReadWrite` additionally writes operator input back on the `write_event`: `LostFocus` for TextBox `Text`, `CheckStateChanged` for CheckBox `Checked`, `SelectedRowChanged` for DataGrid `SelectedRow`. `ReadOnly` bindings have no `write_event`.

### `mcsource` syntax

| Form | Example | Meaning | Writable | Simulated |
|---|---|---|---|---|
| VR | `VR(591)`, `VR:591` | global VR register | yes | yes |
| VR bit | `VR(5000).1` | bit 1 of `VR(5000)` (0/1) | yes | yes |
| VR arithmetic | `VR(635)/100`, `VR(10)*2`, `VR(3)+1` | scaled display (Motion Perfect projects do use `ReadWrite` on these) | not in the preview | yes |
| VR difference | `VR(102)-VR(537)` | | no | yes |
| Comparison / logic | `VR(547) = 1 AND (VR(608) = 1 OR VR(609) = 1)` | 1 when true | no | yes |
| Program variable | `PROGRAM:varname:progname:-1` | BASIC LOCAL/global in a program | yes | yes (stored) |
| TABLE | `TABLE:20` | TABLE memory | no | stored only |
| Output state | `READ_OP:11`, `READ_OP(11)` | digital output | no | stored only |
| anything else | `MPOS AXIS(0)`, `IN(5)`, `LOOKUP(...)` | controller expression | – | not simulated (0) |

Keep bindings simple. Scale or combine values in the controller program and expose the result in a VR if the expression gets long — it is cheaper for the HMI and easier to test.

### What each property does with a bound value

| Component.Property | Effect |
|---|---|
| Label/TextBox `.Text` | shows the value, formatted by `FormatType` (`FORMAT_TEXT` / `FORMAT_INTEGER` / `FORMAT_REAL` with `FormatNumDP` decimals, padded to `FormatWidth`) |
| Rectangle `.Status` | true → `BackColor`, false → `OffBackColour` (status lamp) |
| PictureBox `.Status` | index into `ImageList` (multi-state graphic: valve open/closed, motor states) |
| CheckBox `.Checked` | tick shown when non-zero |
| any `.Visible` | component hidden while 0 (alarm banners, mode-dependent controls) |
| any `.Left`/`.Top`/`.Width`/`.Height` | position/size in px (moving carriage, bar graph) |
| Button/Rectangle `.BackColor` | colour from a VR holding a 32-bit ARGB integer (e.g. `VR(30)=$FF2EA043`) |
| DataGrid `.SelectedRow` | selected row index written back on tap |

## Event actions (`<events>`)

```xml
<events>
  <event>
    <name>Click</name>
    <actions>
      <action>Exec;VR(10).0=1</action>
      <action>GotoPage;RUN</action>
    </actions>
  </event>
</events>
```

Events: `Click` (Button, PictureBox, TextBox), `ButtonDown` / `ButtonUp` (Button — press and release). Multiple actions run in order.

| Action string | Meaning | Simulated |
|---|---|---|
| `GotoPage;PAGE` | show `PAGE.TGD` | yes |
| `Exec;VR(n).b=1` / `=0` | set / clear a bit | yes |
| `Exec;VR(n).b=(VR(n).b = 0)` | toggle a bit | yes |
| `Exec;VR(n)=<expr>` | assign (e.g. `VR(5)=VR(5)+1`, `VR(7)=0`) | yes |
| `VS;VR:n;value` | write a value to a VR | yes |
| `VS;PROGRAM:var:prog:-1;value` | write a program variable | yes |
| `OpenKeyPad;REAL_NUMPAD_ENTER;txtName` | open the decimal keypad for TextBox `txtName`; the value is written through **that** box's `Text` binding, limited by its `MinVal`/`MaxVal` | yes |
| `OpenKeyPad;INT_NUMPAD_ENTER;txtName` | integer keypad (`INT_NUMPAD_ENTER_123` also exists) | yes |
| `Exec;OP(8,1)` and other BASIC | executed by the controller | no (logged) |

The third field of `OpenKeyPad` should name the TextBox that was tapped. If it names another box, tapping this one edits the other box's VR (an easy slip when copying controls); the validator and `check_preview.cjs` both flag it.

`Exec` runs a BASIC statement on the controller. Prefer setting VR command bits over driving outputs or motion directly from the HMI — the controller program stays in charge of interlocks.
