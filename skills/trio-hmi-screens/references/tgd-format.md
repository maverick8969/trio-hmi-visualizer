# TGD / TGM file format

## TGD (one screen page)

```xml
<?xml version="1.0" encoding="utf-8"?>
<TGD VerMajor="1" VerMinor="1" xmlns="triomotion:hmi:tgd">
  <form>
    <top>0</top>
    <left>0</left>
    <width>1024</width>
    <height>600</height>
    <backcolor>#FF1B232D</backcolor>
    <bindingrefreshperiod>250</bindingrefreshperiod>
    <component>
      <type>Trio.HMIComponents.Editor.HMIEditorControl</type>
      <name>MAIN</name>
      <properties>
        <property><name>BackColor</name><type>System.Drawing.Color</type><value>#FF1B232D</value></property>
        <property><name>BindingRefreshPeriod</name><type>System.Int32</type><value>250</value></property>
      </properties>
    </component>
  </form>
  <components>
    <component>                                   <!-- popup="true" for keyboards etc. -->
      <assembly>HMIClient</assembly>
      <type>Trio.HMI.Controls.TVBButton</type>
      <name>btnStart</name>
      <properties>
        <property><name>Name</name><type>System.String</type><value>btnStart</value></property>
        <property><name>Left</name><type>System.Int32</type><value>32</value></property>
        ...
      </properties>
      <events> ... </events>                        <!-- see bindings-actions.md -->
    </component>
  </components>
</TGD>
```

Files saved by Motion Perfect may also carry `MinClientVersion` / `DesignerVersion` attributes on `<TGD>`; keep them when editing such files.

## Component types (`Trio.HMI.Controls.*`, assembly `HMIClient`)

| Type | Notes |
|---|---|
| `TVBLabel` | static or bound text |
| `TVBTextBox` | value display/entry; with a `ReadWrite` Text binding + `OpenKeyPad` click it is an input |
| `TVBButton` | `Click`, `ButtonDown`, `ButtonUp` events; optional `Image` |
| `TVBCheckBox` | `Checked` |
| `TVBRectangle` | panels, lamps (`Status`, `OffBackColour`, `ExternalBackColour`) |
| `TVBLine` | `Thickness`, `Orientation` |
| `TVBPictureBox` | `Image`, or `ImageList` + `Status` index |
| `TVBDataGrid` | `Columns` (array of column components), `RowCount`, `RowHeight`, header/body colours, `SelectedRow` |
| `TVBVirtKeyBoard` | popup keyboard (`popup="true"`) |

## Property types

| Property | `<type>` | Value format |
|---|---|---|
| `Name`, `Text` | `System.String` | text; use `<value xml:space="preserve">` when it has leading/trailing spaces or is empty |
| `Left`, `Top`, `Width`, `Height`, `FormatNumDP`, `FormatWidth`, `Thickness`, `BindingRefreshPeriod` | `System.Int32` | integer px / count |
| `Visible`, `Checked`, `ImageSmartStretch` | `System.Boolean` | `True` / `False` |
| `BackColor`, `ForeColor`, `OffBackColour`, `ExternalBackColour` | `System.Drawing.Color` | `#AARRGGBB` — **alpha first**; `#00000000` = transparent |
| `Font` | `System.Drawing.Font` | `Family:size:style` (style 0 normal, 1 bold, 2 italic, 3 both), e.g. `DejaVu Sans:20:1` |
| `TextAlign` (Label, Button, CheckBox) | `System.Drawing.ContentAlignment` | `TopLeft` … `MiddleCenter` … `BottomRight` |
| `TextAlign` (TextBox) | `System.Windows.Forms.HorizontalAlignment` | `Left` / `Center` / `Right` |
| `FormatType` | `Trio.HMI.Controls.TVBTextFormat` | `FORMAT_TEXT` / `FORMAT_INTEGER` / `FORMAT_REAL` |
| `BorderStyle` | `System.Windows.Forms.BorderStyle` | `None` / `FixedSingle` / `Fixed3D` |
| `Orientation` | `System.Windows.Forms.Orientation` | `Horizontal` / `Vertical` |
| `Image` | `System.Drawing.Image` | file name in the HMI project's images |
| `ImageList` | `System.Drawing.Image[]` | `<array dims="N"><element index="0">a.png</element>…</array>` |
| `Status` | `System.Boolean` (Rectangle) / `System.Int32` (PictureBox) | inferred — verify in Motion Perfect |
| `Padding` | `Trio.HMI.Support.Padding` | `top,left,bottom,right` |

Only include properties that differ from the defaults; the HMI fills in the rest.

## Z-order

The first component in `<components>` is front-most. Real files mix orders, so the visualizer layers by type: rectangles at the back, then lines, then everything else; within a type, earlier in the file is in front. Write files the same way (content first, rectangles last) so the HMI and preview agree.

## TGM (project manifest)

Motion Perfect owns the `.TGM` (it also holds component-type defaults under `<TGT>`). The parts the visualizer reads:

```xml
<Device StartupPage="MAIN" ScreenResolution="1024,600">
  <Pages><Page File="MAIN.TGD" /><Page File="SETUP.TGD" /></Pages>
  <Images><Image File="logo.png" /></Images>
</Device>
```

Prefer adding generated pages to an existing Motion Perfect HMI project over hand-writing a TGM. `trio_hmi.py build --tgm` writes a minimal stub only for quick loading into the visualizer.
