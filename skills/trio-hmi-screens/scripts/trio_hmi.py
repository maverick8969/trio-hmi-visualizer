#!/usr/bin/env python3
"""
trio_hmi.py -- Generate Trio Motion HMI screens (.TGD) and an interactive HTML simulator.

Stdlib only (Python 3.8+). Three subcommands:

  build    SPEC.json -o OUTDIR      JSON screen spec  -> <PAGE>.TGD files, preview.html, VR_MAP.md
  preview  FILE.TGD ... -o OUT.html Existing TGD files -> interactive preview.html
  validate FILE.TGD ...             Lint TGD files (bindings, actions, layout, touch targets)

Run `python3 trio_hmi.py <cmd> -h` for options. The spec format is documented in
references/spec-format.md next to this script.
"""

import argparse
import base64
import json
import os
import re
import sys
import xml.etree.ElementTree as ET
from collections import OrderedDict

SKILL_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RUNTIME_DIR = os.path.join(SKILL_DIR, "assets", "runtime")
TGD_NS = "triomotion:hmi:tgd"

# --------------------------------------------------------------------------
# Trio component / property vocabulary
# --------------------------------------------------------------------------

COMPONENT_TYPES = {
    "Label": "TVBLabel",
    "TextBox": "TVBTextBox",
    "Button": "TVBButton",
    "CheckBox": "TVBCheckBox",
    "Rectangle": "TVBRectangle",
    "Line": "TVBLine",
    "PictureBox": "TVBPictureBox",
}
KNOWN_TVB = set(COMPONENT_TYPES.values()) | {"TVBDataGrid", "TVBVirtKeyBoard"}

T_INT = "System.Int32"
T_STR = "System.String"
T_BOOL = "System.Boolean"
T_COLOR = "System.Drawing.Color"
T_FONT = "System.Drawing.Font"

# Property -> .NET type name written into <type>.  Kept in ONE table so that if a
# Motion Perfect version disagrees, it is corrected in one place.
PROP_TYPES = {
    "Name": T_STR, "Left": T_INT, "Top": T_INT, "Width": T_INT, "Height": T_INT,
    "Text": T_STR, "BackColor": T_COLOR, "ForeColor": T_COLOR, "Font": T_FONT,
    "Visible": T_BOOL, "Checked": T_BOOL,
    "FormatType": "Trio.HMI.Controls.TVBTextFormat", "FormatNumDP": T_INT, "FormatWidth": T_INT,
    "BorderStyle": "System.Windows.Forms.BorderStyle",
    "OffBackColour": T_COLOR, "ExternalBackColour": T_COLOR,
    "Image": "System.Drawing.Image", "ImageList": "System.Drawing.Image[]",
    "ImageSmartStretch": T_BOOL, "Thickness": T_INT,
    "Orientation": "System.Windows.Forms.Orientation",
}
TEXTALIGN_TYPE = {
    "TVBTextBox": "System.Windows.Forms.HorizontalAlignment",  # Left / Center / Right
}
STATUS_TYPE = {"TVBRectangle": T_BOOL, "TVBPictureBox": T_INT}

CONTENT_ALIGN = {"TopLeft", "TopCenter", "TopRight", "MiddleLeft", "MiddleCenter",
                 "MiddleRight", "BottomLeft", "BottomCenter", "BottomRight"}
H_ALIGN = {"Left", "Center", "Right"}
FORMATS = {"text": "FORMAT_TEXT", "integer": "FORMAT_INTEGER", "int": "FORMAT_INTEGER",
           "real": "FORMAT_REAL", "float": "FORMAT_REAL"}

EVENT_KEYS = {"onClick": "Click", "onPress": "ButtonDown", "onRelease": "ButtonUp"}

THEMES = {
    "dark": {
        "bg": "#1B232D", "panel": "#26313D", "edge": "#3A4756", "header": "#111820", "headerText": "#E6EDF3",
        "text": "#E6EDF3", "muted": "#9AA7B4", "accent": "#2F81F7",
        "ok": "#2EA043", "warn": "#D29922", "alarm": "#DA3633", "off": "#3A4756",
        "inputBg": "#0D1117", "inputText": "#FFFFFF",
        "button": "#3A4756", "buttonText": "#FFFFFF", "navActive": "#2F81F7",
    },
    "light": {
        "bg": "#E9ECEF", "panel": "#FFFFFF", "edge": "#ADB5BD", "header": "#343A40", "headerText": "#FFFFFF",
        "text": "#212529", "muted": "#6C757D", "accent": "#0D6EFD",
        "ok": "#198754", "warn": "#B45309", "alarm": "#DC3545", "off": "#6C757D",
        "inputBg": "#FFFFFF", "inputText": "#000000",
        "button": "#DEE2E6", "buttonText": "#212529", "navActive": "#0D6EFD",
    },
}

NAME_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


class SpecError(Exception):
    pass


# --------------------------------------------------------------------------
# Value helpers
# --------------------------------------------------------------------------

class Theme:
    def __init__(self, spec):
        t = spec.get("theme", "dark")
        if isinstance(t, str):
            t = {"base": t}
        base = t.get("base", "dark")
        if base not in THEMES:
            raise SpecError("Unknown theme base '%s' (use dark or light)" % base)
        self.colors = dict(THEMES[base])
        self.colors.update(t.get("colors", {}))
        self.family = t.get("font", "DejaVu Sans")

    def color(self, c):
        if c is None:
            return None
        c = str(c).strip()
        for _ in range(5):
            if c.startswith("@"):
                key = c[1:]
                if key not in self.colors:
                    raise SpecError("Unknown theme colour '%s' (have: %s)" % (c, ", ".join(sorted(self.colors))))
                c = self.colors[key]
            else:
                break
        if c.lower() == "transparent":
            return "#00000000"
        if re.fullmatch(r"#[0-9A-Fa-f]{6}", c):
            return "#FF" + c[1:].upper()
        if re.fullmatch(r"#[0-9A-Fa-f]{8}", c):
            return c.upper()
        raise SpecError("Bad colour '%s' (use #RRGGBB, #AARRGGBB, @themeColour or transparent)" % c)

    def font(self, f, default_size=20, default_bold=False):
        if f is None:
            f = {}
        if isinstance(f, (int, float)):
            f = {"size": int(f)}
        if isinstance(f, str):
            if re.fullmatch(r"[^:]+:\d+:\d+", f):
                return f
            raise SpecError("Bad font '%s' (use 'Family:size:style' or {size, bold, italic})" % f)
        style = (1 if f.get("bold", default_bold) else 0) | (2 if f.get("italic") else 0)
        return "%s:%d:%d" % (f.get("family", self.family), int(f.get("size", default_size)), style)


def fmt_bool(v):
    return "True" if v else "False"


def xml_esc(s):
    return (str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            .replace('"', "&quot;").replace("'", "&apos;"))


# --------------------------------------------------------------------------
# Expressions, bindings and actions
# --------------------------------------------------------------------------

def classify_mcsource(src):
    """Mirror of parseBinding() in binding-engine.js. Returns (kind, writable)."""
    s = src.strip()
    if re.fullmatch(r"VR[:(]\d+\)?", s):
        return "vr", True
    if re.fullmatch(r"VR\(\d+\)\.\d+", s):
        return "vr_bit", True
    if re.fullmatch(r"VR\(\d+\)\s*[+\-*/]\s*[\d.]+", s):
        return "vr_expr", False
    if re.fullmatch(r"VR\(\d+\)\s*-\s*VR\(\d+\)", s):
        return "vr_expr", False
    if re.fullmatch(r"PROGRAM:[^:]+:[^:]+:-?\d+", s):
        return "program", True
    if re.fullmatch(r"TABLE:\d+", s):
        return "table", False
    if re.fullmatch(r"READ_OP[:(]\d+\)?", s):
        return "read_op", False
    if " AND " in s or " OR " in s or re.search(r"VR\(\d+\)\s*[=<>]", s):
        return "boolean_expr", False
    return "custom", True


EXPR_TOKEN_RE = re.compile(
    r"\s*(VR\(\d+\)\.\d+|VR\(\d+\)|VR:\d+|\d+\.?\d*|AND|OR|NOT|MOD|TRUE|FALSE|<>|<=|>=|[-+*/()=<>])",
    re.I)


def expr_supported(expr):
    """True if compileExpression() in the JS runtime can evaluate this expression."""
    pos, s = 0, expr.strip()
    while pos < len(s):
        m = EXPR_TOKEN_RE.match(s, pos)
        if not m:
            return False
        pos = m.end()
        while pos < len(s) and s[pos].isspace():
            pos += 1
    return bool(s)


def vr_refs(text):
    """All VR addresses mentioned in an expression/action: list of (index, bit|None)."""
    out = []
    for m in re.finditer(r"VR\((\d+)\)(?:\.(\d+))?|VR:(\d+)", text):
        if m.group(3):
            out.append((int(m.group(3)), None))
        else:
            out.append((int(m.group(1)), int(m.group(2)) if m.group(2) else None))
    return out


ASSIGN_RE = re.compile(r"^\s*VR\((\d+)\)(?:\.(\d+))?\s*=(.+)$")


def classify_action(action):
    """Return (kind, detail, simulatable)."""
    parts = action.split(";")
    kind = parts[0]
    if kind == "GotoPage":
        return kind, parts[1] if len(parts) > 1 else "", len(parts) > 1
    if kind == "OpenKeyPad":
        return kind, parts[2] if len(parts) > 2 else "", len(parts) > 2
    if kind == "Exec":
        body = ";".join(parts[1:])
        m = ASSIGN_RE.match(body)
        return kind, body, bool(m and expr_supported(m.group(3)))
    if kind == "VS":
        tgt = parts[1] if len(parts) > 1 else ""
        ok = bool(re.fullmatch(r"VR[:(]\d+\)?", tgt) or re.fullmatch(r"PROGRAM:[^:]+:[^:]+:-?\d+", tgt))
        return kind, tgt, ok
    return kind, action, False


def build_action(a):
    """Expand an action shortcut object into a Trio action string."""
    if isinstance(a, str):
        return a
    if not isinstance(a, dict):
        raise SpecError("Action must be a string or object: %r" % (a,))
    if "goto" in a:
        return "GotoPage;%s" % a["goto"]
    if "toggle" in a:
        t = a["toggle"]
        if not re.fullmatch(r"VR\(\d+\)\.\d+", t):
            raise SpecError("toggle target must be a bit like VR(10).0, got %r" % t)
        return "Exec;%s=(%s = 0)" % (t, t)
    if "set" in a:
        t = a["set"]
        if not re.fullmatch(r"VR\(\d+\)(\.\d+)?", t):
            raise SpecError("set target must be VR(n) or VR(n).bit, got %r" % t)
        return "Exec;%s=%s" % (t, a.get("value", 1))
    if "keypad" in a:
        return "OpenKeyPad;%s;%s" % (a.get("kind", "Numeric"), a["keypad"])
    if "exec" in a:
        return "Exec;%s" % a["exec"]
    if "vs" in a:
        return "VS;%s;%s" % (a["vs"], a.get("value", 1))
    raise SpecError("Unknown action shortcut %r (use goto/toggle/set/keypad/exec/vs)" % (a,))


# --------------------------------------------------------------------------
# Component model
# --------------------------------------------------------------------------

class Comp:
    def __init__(self, tvb, name):
        self.tvb = tvb
        self.name = name
        self.props = OrderedDict()   # name -> [type, value, binding(dict)|None]
        self.events = OrderedDict()  # event name -> [actions]

    def set(self, prop, value, typ=None):
        if value is None:
            return
        if typ is None:
            if prop == "TextAlign":
                typ = TEXTALIGN_TYPE.get(self.tvb, "System.Drawing.ContentAlignment")
            elif prop == "Status":
                typ = STATUS_TYPE.get(self.tvb, T_INT)
            else:
                typ = PROP_TYPES.get(prop, T_STR)
        self.props[prop] = [typ, value, self.props.get(prop, [None, None, None])[2]]

    def bind(self, prop, mcsource, mode="ReadOnly", default=None):
        if prop not in self.props:
            if default is None:
                default = {T_BOOL: False, T_INT: 0}.get(
                    PROP_TYPES.get(prop) or (STATUS_TYPE.get(self.tvb) if prop == "Status" else None), "")
            self.set(prop, default)
        self.props[prop][2] = {"mcsource": mcsource, "mode": mode}

    def on(self, event, actions):
        self.events.setdefault(event, []).extend(actions)

    def rect(self):
        g = lambda k: int(self.props.get(k, [0, 0])[1] or 0)
        return g("Left"), g("Top"), g("Width"), g("Height")


class PageBuilder:
    PREFIX = {"TVBLabel": "lbl", "TVBTextBox": "txt", "TVBButton": "btn", "TVBCheckBox": "chk",
              "TVBRectangle": "rect", "TVBLine": "line", "TVBPictureBox": "pic"}

    def __init__(self, page_spec, project, theme):
        self.spec = page_spec
        self.project = project
        self.theme = theme
        self.name = page_spec["name"]
        if not NAME_RE.match(self.name):
            raise SpecError("Page name '%s' must be an identifier (letters, digits, _)" % self.name)
        self.comps = []
        self.names = set()
        self.counters = {}

    # ---- naming ----
    def uname(self, tvb, name=None):
        if name:
            if not NAME_RE.match(name):
                raise SpecError("[%s] component name '%s' must be an identifier" % (self.name, name))
            if name in self.names:
                raise SpecError("[%s] duplicate component name '%s'" % (self.name, name))
        else:
            p = self.PREFIX.get(tvb, "c")
            while True:
                self.counters[p] = self.counters.get(p, 0) + 1
                name = "%s%d" % (p, self.counters[p])
                if name not in self.names:
                    break
        self.names.add(name)
        return name

    # ---- primitive component from spec dict ----
    def primitive(self, c):
        t = c.get("type")
        if t not in COMPONENT_TYPES:
            raise SpecError("[%s] unknown type %r (types: %s; widgets: %s)" % (
                self.name, t, ", ".join(COMPONENT_TYPES), ", ".join(sorted(WIDGETS))))
        tvb = COMPONENT_TYPES[t]
        th = self.theme
        comp = Comp(tvb, self.uname(tvb, c.get("name")))
        for k in ("x", "y", "w", "h"):
            if k not in c:
                raise SpecError("[%s] %s '%s' is missing '%s'" % (self.name, t, comp.name, k))
        comp.set("Name", comp.name)
        comp.set("Left", int(c["x"]))
        comp.set("Top", int(c["y"]))
        comp.set("Width", int(c["w"]))
        comp.set("Height", int(c["h"]))

        defaults = {
            "TVBLabel": ("transparent", "@text", "MiddleLeft"),
            "TVBTextBox": ("@inputBg", "@inputText", "Right"),
            "TVBButton": ("@button", "@buttonText", None),
            "TVBCheckBox": ("transparent", "@text", None),
            "TVBRectangle": ("@panel", "transparent", None),
            "TVBLine": (None, "@edge", None),
            "TVBPictureBox": ("transparent", None, None),
        }[tvb]
        back = c.get("back", defaults[0])
        fore = c.get("fore", defaults[1])
        if tvb != "TVBLine" and back is not None:
            comp.set("BackColor", th.color(back))
        if fore is not None:
            comp.set("ForeColor", th.color(fore))

        if tvb in ("TVBLabel", "TVBTextBox", "TVBButton", "TVBCheckBox"):
            comp.set("Text", str(c.get("text", "")))
            comp.set("Font", th.font(c.get("font"), 20, tvb == "TVBButton"))
            align = c.get("align", defaults[2])
            if align:
                valid = H_ALIGN if tvb == "TVBTextBox" else CONTENT_ALIGN
                if align not in valid:
                    raise SpecError("[%s] %s: align %r not in %s" % (self.name, comp.name, align, sorted(valid)))
                comp.set("TextAlign", align)
        if tvb in ("TVBLabel", "TVBTextBox") and "format" in c:
            f = FORMATS.get(str(c["format"]).lower())
            if not f:
                raise SpecError("[%s] %s: format must be text/integer/real" % (self.name, comp.name))
            comp.set("FormatType", f)
            if f == "FORMAT_REAL":
                comp.set("FormatNumDP", int(c.get("dp", 2)))
            if "width" in c:
                comp.set("FormatWidth", int(c["width"]))
        if tvb == "TVBTextBox":
            comp.set("BorderStyle", c.get("border", "FixedSingle"))
        if tvb == "TVBCheckBox":
            comp.set("Checked", bool(c.get("checked", False)))
        if tvb == "TVBRectangle":
            if "off" in c:
                comp.set("OffBackColour", th.color(c["off"]))
            if "on" in c:
                comp.set("BackColor", th.color(c["on"]))
        if tvb == "TVBLine":
            comp.set("Thickness", int(c.get("thickness", 2)))
            if "orientation" in c:
                comp.set("Orientation", c["orientation"])
        if tvb == "TVBPictureBox":
            if "image" in c:
                comp.set("Image", c["image"])
            if "images" in c:
                comp.set("ImageList", list(c["images"]))
            comp.set("ImageSmartStretch", bool(c.get("stretch", True)))
            comp.set("Status", 0)
        if tvb == "TVBButton" and "image" in c:
            comp.set("Image", c["image"])
        if "visible" in c:
            if isinstance(c["visible"], bool):
                comp.set("Visible", c["visible"])
            else:
                comp.bind("Visible", str(c["visible"]), default=True)

        # ---- bindings ----
        main_prop = {"TVBLabel": "Text", "TVBTextBox": "Text", "TVBButton": "Text",
                     "TVBCheckBox": "Checked", "TVBRectangle": "Status",
                     "TVBPictureBox": "Status"}.get(tvb)
        if "bind" in c:
            if not main_prop:
                raise SpecError("[%s] %s cannot take 'bind'" % (self.name, comp.name))
            mode = c.get("mode")
            if mode is None:
                mode = "ReadWrite" if (tvb in ("TVBTextBox", "TVBCheckBox") and c.get("editable", True)) else "ReadOnly"
            comp.bind(main_prop, str(c["bind"]), mode)
        for prop, src in (c.get("bindings") or {}).items():
            if isinstance(src, dict):
                comp.bind(prop, src["mcsource"], src.get("mode", "ReadOnly"))
            else:
                comp.bind(prop, str(src))
        for prop, pv in (c.get("props") or {}).items():
            if isinstance(pv, dict) and "type" in pv:
                comp.set(prop, pv.get("value"), pv["type"])
            else:
                comp.set(prop, pv)

        # ---- events ----
        for key, evname in EVENT_KEYS.items():
            if key in c:
                acts = c[key] if isinstance(c[key], list) else [c[key]]
                comp.on(evname, [build_action(a) for a in acts])
        # Editable textbox: open the numeric keypad on touch (as Motion Perfect does)
        if tvb == "TVBTextBox" and comp.props.get("Text", [0, 0, None])[2] and \
                comp.props["Text"][2]["mode"] == "ReadWrite" and c.get("keypad", True) and "Click" not in comp.events:
            comp.on("Click", ["OpenKeyPad;Numeric;%s" % comp.name])

        self.comps.append(comp)
        return comp

    def add(self, c):
        if "widget" in c:
            w = c["widget"]
            if w not in WIDGETS:
                raise SpecError("[%s] unknown widget %r (widgets: %s)" % (self.name, w, ", ".join(sorted(WIDGETS))))
            WIDGETS[w](self, c)
        else:
            self.primitive(c)

    def build(self):
        nav = self.project.get("nav")
        if nav and self.spec.get("nav", True):
            w_navbar(self, dict(nav, current=self.name, name=nav.get("name", "nav")))
        for c in self.spec.get("components", []):
            self.add(c)
        return self.comps


# --------------------------------------------------------------------------
# Widgets: composite patterns that expand into primitive TVB components
# --------------------------------------------------------------------------

def _acts(v):
    if v is None:
        return []
    return list(v) if isinstance(v, list) else [v]


def _base(c, page, required=("x", "y", "w", "h")):
    for k in required:
        if k not in c:
            raise SpecError("[%s] widget %s missing '%s'" % (page.name, c.get("widget"), k))
    n = c.get("name")
    if not n:
        page.counters["w"] = page.counters.get("w", 0) + 1
        n = "%s%d" % (c["widget"], page.counters["w"])
    return n, int(c["x"]), int(c["y"]), int(c["w"]), int(c["h"])


def w_header(page, c):
    """Full-width title bar: {widget:header, text, h?=56, status?:{text|bind, format?}}"""
    W = page.project["width"]
    h = int(c.get("h", 56))
    n = c.get("name", "hdr")
    page.primitive({"type": "Rectangle", "name": n + "_bg", "x": 0, "y": 0, "w": W, "h": h,
                    "back": c.get("back", "@header")})
    page.primitive({"type": "Label", "name": n + "_title", "x": 16, "y": 0, "w": W - 32, "h": h,
                    "text": c.get("text", page.name), "font": c.get("font", {"size": 26, "bold": True}),
                    "fore": c.get("fore", "@headerText"), "align": "MiddleLeft"})
    if c.get("status"):
        s = c["status"]
        page.primitive({"type": "Label", "name": n + "_status", "x": W - 316, "y": 0, "w": 300, "h": h,
                        "text": s.get("text", ""), "bind": s.get("bind"), "format": s.get("format", "text"),
                        "font": {"size": 18}, "fore": "@headerText", "align": "MiddleRight"}
                       if s.get("bind") else
                       {"type": "Label", "name": n + "_status", "x": W - 316, "y": 0, "w": 300, "h": h,
                        "text": s.get("text", ""), "font": {"size": 18}, "fore": "@headerText", "align": "MiddleRight"})


def w_navbar(page, c):
    """Row of GotoPage buttons; the current page's button is highlighted.
    {widget:navbar, x,y,w,h, items:[{text,page}], current?}"""
    n, x, y, w, h = _base(c, page)
    items = c["items"]
    gap = int(c.get("gap", 6))
    bw = (w - gap * (len(items) - 1)) // len(items)
    cur = c.get("current", page.name)
    for i, it in enumerate(items):
        active = it["page"] == cur
        page.primitive({"type": "Button", "name": "%s_%s" % (n, it["page"]),
                        "x": x + i * (bw + gap), "y": y, "w": bw, "h": h, "text": it["text"],
                        "font": c.get("font", {"size": 18, "bold": True}),
                        "back": "@navActive" if active else "@button",
                        "fore": "#FFFFFF" if active else "@buttonText",
                        **({} if active else {"onClick": [{"goto": it["page"]}]})})


def w_panel(page, c):
    """Grouping panel with a caption: {widget:panel, x,y,w,h, title}"""
    n, x, y, w, h = _base(c, page)
    page.primitive({"type": "Rectangle", "name": n, "x": x, "y": y, "w": w, "h": h,
                    "back": c.get("back", "@panel"), "fore": c.get("border", "@edge")})
    if c.get("title"):
        page.primitive({"type": "Label", "name": n + "_title", "x": x + 12, "y": y + 6, "w": w - 24, "h": 28,
                        "text": c["title"], "font": {"size": 16, "bold": True}, "fore": "@muted"})


def w_lamp(page, c):
    """Status indicator: coloured rectangle driven by a bit/expression, with optional text.
    {widget:lamp, x,y,w,h, status:'VR(10).0', on?:@ok, off?:@off, text?}"""
    n, x, y, w, h = _base(c, page)
    page.primitive({"type": "Rectangle", "name": n, "x": x, "y": y, "w": w, "h": h,
                    "on": c.get("on", "@ok"), "off": c.get("off", "@off"), "bind": c["status"],
                    "fore": c.get("border", "transparent")})
    if c.get("text"):
        page.primitive({"type": "Label", "name": n + "_lbl", "x": x, "y": y, "w": w, "h": h,
                        "text": c["text"], "align": "MiddleCenter",
                        "font": c.get("font", {"size": 16, "bold": True}), "fore": c.get("fore", "#FFFFFF")})


def w_numeric(page, c):
    """Caption + editable numeric entry (opens keypad) + units.
    {widget:numeric, x,y,w,h, label, bind:'VR(100)', units?, dp?=2, format?, labelW?, unitsW?}"""
    n, x, y, w, h = _base(c, page)
    lw = int(c.get("labelW", w * 0.45))
    uw = int(c.get("unitsW", 60 if c.get("units") else 0))
    page.primitive({"type": "Label", "name": n + "_cap", "x": x, "y": y, "w": lw - 8, "h": h,
                    "text": c.get("label", ""), "font": c.get("font", {"size": 18}), "fore": "@text"})
    page.primitive({"type": "TextBox", "name": n, "x": x + lw, "y": y, "w": w - lw - uw, "h": h,
                    "bind": c["bind"], "mode": "ReadWrite", "format": c.get("format", "real"),
                    "dp": c.get("dp", 2), "font": c.get("valueFont", {"size": 22}), "align": "Right"})
    if uw:
        page.primitive({"type": "Label", "name": n + "_units", "x": x + w - uw + 6, "y": y, "w": uw - 6, "h": h,
                        "text": c["units"], "font": {"size": 16}, "fore": "@muted"})


def w_readout(page, c):
    """Caption + read-only live value + units.
    {widget:readout, x,y,w,h, label, bind, units?, dp?, format?}"""
    n, x, y, w, h = _base(c, page)
    lw = int(c.get("labelW", w * 0.45))
    uw = int(c.get("unitsW", 60 if c.get("units") else 0))
    page.primitive({"type": "Label", "name": n + "_cap", "x": x, "y": y, "w": lw - 8, "h": h,
                    "text": c.get("label", ""), "font": c.get("font", {"size": 18}), "fore": "@text"})
    page.primitive({"type": "Label", "name": n, "x": x + lw, "y": y, "w": w - lw - uw, "h": h,
                    "bind": c["bind"], "format": c.get("format", "real"), "dp": c.get("dp", 2),
                    "font": c.get("valueFont", {"size": 22, "bold": True}), "fore": c.get("fore", "@accent"),
                    "align": "MiddleRight", "back": c.get("back", "@inputBg")})
    if uw:
        page.primitive({"type": "Label", "name": n + "_units", "x": x + w - uw + 6, "y": y, "w": uw - 6, "h": h,
                        "text": c["units"], "font": {"size": 16}, "fore": "@muted"})


def w_toggle(page, c):
    """Latching on/off button with a state lamp strip underneath.
    {widget:toggle, x,y,w,h, text, bit:'VR(10).0', on?, off?, lampH?=10}"""
    n, x, y, w, h = _base(c, page)
    lh = int(c.get("lampH", 10))
    page.primitive({"type": "Button", "name": n, "x": x, "y": y, "w": w, "h": h - lh - 4,
                    "text": c.get("text", ""), "font": c.get("font"), "back": c.get("back", "@button"),
                    "onClick": [{"toggle": c["bit"]}] + _acts(c.get("onClick"))})
    page.primitive({"type": "Rectangle", "name": n + "_lamp", "x": x, "y": y + h - lh, "w": w, "h": lh,
                    "bind": c["bit"], "on": c.get("on", "@ok"), "off": c.get("off", "@off")})


def w_momentary(page, c):
    """Hold-to-run button (jog): bit=1 while pressed, 0 on release. Optional lamp strip.
    {widget:momentary, x,y,w,h, text, bit, lamp?=true}"""
    n, x, y, w, h = _base(c, page)
    lamp = c.get("lamp", True)
    lh = int(c.get("lampH", 10)) if lamp else 0
    page.primitive({"type": "Button", "name": n, "x": x, "y": y, "w": w, "h": h - (lh + 4 if lamp else 0),
                    "text": c.get("text", ""), "font": c.get("font"), "back": c.get("back", "@button"),
                    "onPress": [{"set": c["bit"], "value": 1}],
                    "onRelease": [{"set": c["bit"], "value": 0}]})
    if lamp:
        page.primitive({"type": "Rectangle", "name": n + "_lamp", "x": x, "y": y + h - lh, "w": w, "h": lh,
                        "bind": c["bit"], "on": c.get("on", "@accent"), "off": c.get("off", "@off")})


def w_command(page, c):
    """One-shot command button (e.g. START / STOP / RESET) writing a value.
    {widget:command, x,y,w,h, text, set:'VR(10).1', value?=1, back?}"""
    n, x, y, w, h = _base(c, page)
    page.primitive({"type": "Button", "name": n, "x": x, "y": y, "w": w, "h": h,
                    "text": c.get("text", ""), "font": c.get("font"), "back": c.get("back", "@button"),
                    "fore": c.get("fore", "@buttonText"),
                    "onClick": [{"set": c["set"], "value": c.get("value", 1)}] + _acts(c.get("onClick"))})


def w_stepper(page, c):
    """[-] value [+] adjuster. {widget:stepper, x,y,w,h, bind:'VR(5)', step?=1, label?, dp?}"""
    n, x, y, w, h = _base(c, page)
    m = re.fullmatch(r"VR\((\d+)\)", c["bind"])
    if not m:
        raise SpecError("[%s] stepper bind must be VR(n)" % page.name)
    step = c.get("step", 1)
    bw = h
    page.primitive({"type": "Button", "name": n + "_dec", "x": x, "y": y, "w": bw, "h": h, "text": "-",
                    "font": {"size": 26, "bold": True}, "onClick": [{"set": c["bind"], "value": "%s-%s" % (c["bind"], step)}]})
    page.primitive({"type": "TextBox", "name": n, "x": x + bw + 6, "y": y, "w": w - 2 * bw - 12, "h": h,
                    "bind": c["bind"], "mode": "ReadWrite", "format": c.get("format", "integer"),
                    "dp": c.get("dp", 0), "align": "Center", "font": {"size": 22}})
    page.primitive({"type": "Button", "name": n + "_inc", "x": x + w - bw, "y": y, "w": bw, "h": h, "text": "+",
                    "font": {"size": 26, "bold": True}, "onClick": [{"set": c["bind"], "value": "%s+%s" % (c["bind"], step)}]})


def w_alarm(page, c):
    """Banner shown only while a condition is true. {widget:alarm, x,y,w,h, when:'VR(50).0', text}"""
    n, x, y, w, h = _base(c, page)
    page.primitive({"type": "Label", "name": n, "x": x, "y": y, "w": w, "h": h, "text": c.get("text", "ALARM"),
                    "back": c.get("back", "@alarm"), "fore": "#FFFFFF", "align": "MiddleCenter",
                    "font": c.get("font", {"size": 20, "bold": True}), "visible": c["when"]})


WIDGETS = {
    "header": w_header, "navbar": w_navbar, "panel": w_panel, "lamp": w_lamp,
    "numeric": w_numeric, "readout": w_readout, "toggle": w_toggle, "momentary": w_momentary,
    "command": w_command, "stepper": w_stepper, "alarm": w_alarm,
}


# --------------------------------------------------------------------------
# TGD serialisation
# --------------------------------------------------------------------------

def z_rank(c):
    # In a TGD the first component in the file is front-most. Emit content first,
    # then lines, then rectangles; within each group, components declared LATER in
    # the spec come FIRST in the file (spec order is painter's order: later = on top).
    return {"TVBRectangle": 2, "TVBLine": 1}.get(c.tvb, 0)


def serialize_page(page_name, comps, width, height, back, refresh=250, title=None):
    L = ['<?xml version="1.0" encoding="utf-8"?>',
         '<TGD VerMajor="1" VerMinor="1" xmlns="%s">' % TGD_NS,
         "  <form>", "    <top>0</top>", "    <left>0</left>",
         "    <width>%d</width>" % width, "    <height>%d</height>" % height,
         "    <backcolor>%s</backcolor>" % back,
         "    <bindingrefreshperiod>%d</bindingrefreshperiod>" % refresh,
         "    <component>", "      <type>Trio.HMIComponents.Editor.HMIEditorControl</type>",
         "      <name>%s</name>" % xml_esc(page_name), "      <properties>"]
    L += _prop_xml("BackColor", T_COLOR, back, None, "        ")
    L += _prop_xml("BindingRefreshPeriod", T_INT, refresh, None, "        ")
    L += ["      </properties>", "    </component>", "  </form>", "  <components>"]
    ordered = sorted(enumerate(comps), key=lambda ic: (z_rank(ic[1]), -ic[0]))
    for _, c in ordered:
        L += ["    <component>", "      <assembly>HMIClient</assembly>",
              "      <type>Trio.HMI.Controls.%s</type>" % c.tvb,
              "      <name>%s</name>" % xml_esc(c.name), "      <properties>"]
        for pname, (ptype, pval, binding) in c.props.items():
            L += _prop_xml(pname, ptype, pval, binding, "        ")
        L.append("      </properties>")
        if c.events:
            L.append("      <events>")
            for ev, acts in c.events.items():
                L += ["        <event>", "          <name>%s</name>" % ev, "          <actions>"]
                L += ["            <action>%s</action>" % xml_esc(a) for a in acts]
                L += ["          </actions>", "        </event>"]
            L.append("      </events>")
        L.append("    </component>")
    L += ["  </components>", "</TGD>", ""]
    return "\n".join(L)


def _prop_xml(name, typ, val, binding, ind):
    if isinstance(val, bool):
        sval = fmt_bool(val)
    elif isinstance(val, list):
        sval = None
    else:
        sval = xml_esc(val)
    L = [ind + "<property>", ind + "  <name>%s</name>" % name, ind + "  <type>%s</type>" % typ]
    if sval is None:
        L.append(ind + "  <value>")
        L.append(ind + '    <array dims="%d">' % len(val))
        L += [ind + '      <element index="%d">%s</element>' % (i, xml_esc(v)) for i, v in enumerate(val)]
        L += [ind + "    </array>", ind + "  </value>"]
    elif typ == T_STR and (sval != sval.strip() or sval == ""):
        L.append(ind + '  <value xml:space="preserve">%s</value>' % sval)
    else:
        L.append(ind + "  <value>%s</value>" % sval)
    if binding:
        L += [ind + "  <binding>", ind + "    <mcsource>%s</mcsource>" % xml_esc(binding["mcsource"]),
              ind + "    <mode>%s</mode>" % binding["mode"], ind + "  </binding>"]
    L.append(ind + "</property>")
    return L


# --------------------------------------------------------------------------
# TGD reading (for validate / preview of existing files)
# --------------------------------------------------------------------------

def _strip_ns(tree):
    for el in tree.iter():
        if isinstance(el.tag, str) and "}" in el.tag:
            el.tag = el.tag.split("}", 1)[1]
    return tree


def read_tgd(path):
    with open(path, "r", encoding="utf-8-sig") as f:
        xml = f.read()
    root = _strip_ns(ET.fromstring(xml))
    form = root.find("form")
    page = {
        "file": os.path.basename(path), "name": re.sub(r"\.tgd$", "", os.path.basename(path), flags=re.I),
        "xml": xml, "width": int((form.findtext("width") if form is not None else None) or 1024),
        "height": int((form.findtext("height") if form is not None else None) or 600), "components": [],
    }
    comps = root.find("components")
    for el in (comps if comps is not None else []):
        c = {"type": (el.findtext("type") or "").split(".")[-1], "name": el.findtext("name") or "",
             "popup": el.get("popup") == "true", "props": {}, "events": {}}
        for p in el.findall("properties/property"):
            b = p.find("binding")
            c["props"][p.findtext("name")] = {
                "type": p.findtext("type"), "value": (p.findtext("value") or "").strip(),
                "binding": {"mcsource": b.findtext("mcsource") or "", "mode": b.findtext("mode") or "ReadOnly"}
                if b is not None else None}
        for e in el.findall("events/event"):
            c["events"][e.findtext("name")] = [(a.text or "").strip() for a in e.findall("actions/action")]
        page["components"].append(c)
    return page


# --------------------------------------------------------------------------
# Validation
# --------------------------------------------------------------------------

def validate_pages(pages, min_touch=40):
    errors, warnings = [], []
    page_names = {p["name"] for p in pages}
    for p in pages:
        P = p["name"]
        names = {}
        interactive = []
        for c in p["components"]:
            tag = "%s/%s" % (P, c["name"] or "?")
            if c["type"] not in KNOWN_TVB:
                warnings.append("%s: component type %s is not rendered by the preview" % (tag, c["type"]))
            if not c["name"]:
                errors.append("%s: component without a name" % P)
            elif c["name"] in names:
                errors.append("%s: duplicate component name" % tag)
            names[c["name"]] = c
            if c["popup"]:
                continue

            def num(k, d=0):
                try:
                    return int(float(c["props"].get(k, {}).get("value") or d))
                except ValueError:
                    return d
            x, y, w, h = num("Left"), num("Top"), num("Width", 100), num("Height", 28)
            if x < 0 or y < 0 or x + w > p["width"] or y + h > p["height"]:
                warnings.append("%s: extends outside the %dx%d screen (%d,%d %dx%d)" % (tag, p["width"], p["height"], x, y, w, h))

            is_input = False
            for pname, prop in c["props"].items():
                b = prop.get("binding")
                if not b:
                    continue
                kind, writable = classify_mcsource(b["mcsource"])
                if b["mode"] not in ("ReadOnly", "ReadWrite"):
                    errors.append("%s.%s: binding mode %r must be ReadOnly or ReadWrite" % (tag, pname, b["mode"]))
                if b["mode"] == "ReadWrite" and not writable:
                    errors.append("%s.%s: ReadWrite binding to non-writable expression %r" % (tag, pname, b["mcsource"]))
                if b["mode"] == "ReadWrite":
                    is_input = True
                if kind == "custom":
                    warnings.append("%s.%s: mcsource %r is not simulated by the preview (shown as 0)" % (tag, pname, b["mcsource"]))
                if kind == "boolean_expr" and not expr_supported(b["mcsource"]):
                    warnings.append("%s.%s: expression %r uses tokens the preview cannot evaluate" % (tag, pname, b["mcsource"]))
            for ev, acts in c["events"].items():
                if ev not in ("Click", "ButtonDown", "ButtonUp"):
                    warnings.append("%s: event %s is not simulated by the preview" % (tag, ev))
                for a in acts:
                    kind, detail, ok = classify_action(a)
                    if kind == "GotoPage" and detail not in page_names:
                        (errors if len(pages) > 1 else warnings).append(
                            "%s: GotoPage target %r is not among the loaded pages" % (tag, detail))
                    elif kind == "OpenKeyPad" and detail and detail not in [cc["name"] for cc in p["components"]]:
                        errors.append("%s: OpenKeyPad target %r does not exist on page %s" % (tag, detail, P))
                    elif not ok:
                        warnings.append("%s: action %r will not be simulated by the preview" % (tag, a))
                is_input = is_input or bool(acts)
            if is_input:
                interactive.append((tag, x, y, w, h))
                if w < min_touch or h < min_touch:
                    warnings.append("%s: touch target %dx%d is smaller than %dpx" % (tag, w, h, min_touch))
        for i in range(len(interactive)):
            for j in range(i + 1, len(interactive)):
                a, b = interactive[i], interactive[j]
                if a[1] < b[1] + b[3] and b[1] < a[1] + a[3] and a[2] < b[2] + b[4] and b[2] < a[2] + a[4]:
                    warnings.append("%s overlaps %s (both interactive)" % (a[0], b[0]))
    return errors, warnings


def report(errors, warnings, out=sys.stderr):
    for e in errors:
        print("ERROR   " + e, file=out)
    for w in warnings:
        print("warning " + w, file=out)
    print("%d error(s), %d warning(s)" % (len(errors), len(warnings)), file=out)


# --------------------------------------------------------------------------
# VR map (hand-off document for the controller programmer)
# --------------------------------------------------------------------------

def collect_vr_usage(pages):
    usage = {}  # (idx, bit) -> {"read": set, "write": set}
    for p in pages:
        for c in p["components"]:
            where = "%s/%s" % (p["name"], c["name"])
            for pname, prop in c["props"].items():
                b = prop.get("binding")
                if not b:
                    continue
                for ref in vr_refs(b["mcsource"]):
                    u = usage.setdefault(ref, {"read": set(), "write": set()})
                    u["read"].add("%s.%s" % (where, pname))
                    if b["mode"] == "ReadWrite":
                        u["write"].add("%s.%s (operator entry)" % (where, pname))
            for ev, acts in c["events"].items():
                for a in acts:
                    if a.startswith("Exec;"):
                        m = ASSIGN_RE.match(a[5:])
                        if m:
                            tgt = (int(m.group(1)), int(m.group(2)) if m.group(2) else None)
                            usage.setdefault(tgt, {"read": set(), "write": set()})["write"].add("%s %s" % (where, ev))
                    elif a.startswith("VS;"):
                        for ref in vr_refs(a.split(";")[1]):
                            usage.setdefault(ref, {"read": set(), "write": set()})["write"].add("%s %s" % (where, ev))
    return usage


def vr_map_markdown(title, usage, descs):
    L = ["# %s -- controller variable map" % title, "",
         "Every VR address the HMI reads or writes. HMI writes are operator commands;",
         "the controller program must act on them (and clear one-shot command bits).", "",
         "| Address | Description | HMI reads | HMI writes |", "|---|---|---|---|"]

    def key(r):
        return (r[0], -1 if r[1] is None else r[1])
    for ref in sorted(usage, key=key):
        idx, bit = ref
        addr = "VR(%d)" % idx + (".%d" % bit if bit is not None else "")
        d = descs.get(addr) or descs.get("VR(%d)" % idx, "")
        u = usage[ref]
        L.append("| `%s` | %s | %s | %s |" % (addr, d, "<br>".join(sorted(u["read"])) or "-",
                                             "<br>".join(sorted(u["write"])) or "-"))
    return "\n".join(L) + "\n"


# --------------------------------------------------------------------------
# Preview HTML
# --------------------------------------------------------------------------

RUNTIME_FILES = ["utils.js", "vr-store.js", "binding-engine.js", "tgd-parser.js", "image-store.js",
                 "renderers.js", "action-handler.js", "preview-app.js"]


def build_preview(pages, out_path, title, startup=None, sim=None, image_dirs=()):
    js = []
    for f in RUNTIME_FILES:
        with open(os.path.join(RUNTIME_DIR, f), encoding="utf-8") as fh:
            js.append("// ---- %s ----\n%s" % (f, fh.read()))
    with open(os.path.join(RUNTIME_DIR, "preview.css"), encoding="utf-8") as fh:
        css = fh.read()
    with open(os.path.join(RUNTIME_DIR, "preview.html"), encoding="utf-8") as fh:
        html = fh.read()

    # Images referenced by Image / ImageList properties
    wanted = set()
    for p in pages:
        for c in p["components"]:
            for k in ("Image",):
                v = c["props"].get(k, {}).get("value")
                if v:
                    wanted.add(v)
        for m in re.finditer(r"<element[^>]*>([^<]+\.(?:png|jpe?g|gif|bmp))</element>", p["xml"], re.I):
            wanted.add(m.group(1).strip())
    images = {}
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif", "bmp": "image/bmp"}
    for name in wanted:
        for d in image_dirs:
            fp = os.path.join(d, name)
            if os.path.isfile(fp):
                ext = name.rsplit(".", 1)[-1].lower()
                with open(fp, "rb") as fh:
                    images[name] = "data:%s;base64,%s" % (mime.get(ext, "image/png"), base64.b64encode(fh.read()).decode())
                break

    sim = sim or {}
    usage = collect_vr_usage(pages)
    descs = sim.get("vars", {})
    variables = []
    by_idx = {}
    for (idx, bit) in usage:
        by_idx.setdefault(idx, set())
        if bit is not None:
            by_idx[idx].add(bit)
    for addr in list(descs) + list(sim.get("init", {})):
        m = re.fullmatch(r"VR\((\d+)\)(?:\.(\d+))?", addr)
        if m:
            by_idx.setdefault(int(m.group(1)), set())
            if m.group(2):
                by_idx[int(m.group(1))].add(int(m.group(2)))
    for idx in sorted(by_idx):
        bits = sorted(by_idx[idx])
        variables.append({"index": idx, "bits": bits,
                          "desc": descs.get("VR(%d)" % idx, ""),
                          "bitDescs": {str(b): descs.get("VR(%d).%d" % (idx, b), "") for b in bits}})

    data = {
        "title": title,
        "startup": startup if startup in [p["name"] for p in pages] else pages[0]["name"],
        "pages": [{"name": p["name"], "fileName": p["file"], "xml": p["xml"]} for p in pages],
        "images": images,
        "variables": variables,
        "init": sim.get("init", {}),
        "rules": sim.get("rules", []),
        "tick": sim.get("tick", 100),
    }
    payload = json.dumps(data).replace("</", "<\\/")
    html = (html.replace("/*__CSS__*/", css)
                .replace("/*__RUNTIME__*/", "\n".join(js).replace("</script", "<\\/script"))
                .replace("__DATA__", payload)
                .replace("__TITLE__", xml_esc(title)))
    with open(out_path, "w", encoding="utf-8") as fh:
        fh.write(html)
    missing = sorted(wanted - set(images))
    return missing


# --------------------------------------------------------------------------
# Commands
# --------------------------------------------------------------------------

def cmd_build(args):
    with open(args.spec, encoding="utf-8") as fh:
        spec = json.load(fh)
    proj = spec.get("project", {})
    proj.setdefault("name", os.path.splitext(os.path.basename(args.spec))[0])
    proj.setdefault("width", 1024)
    proj.setdefault("height", 600)
    if "nav" in spec:
        proj["nav"] = spec["nav"]
    theme = Theme(spec)
    os.makedirs(args.out, exist_ok=True)

    built = []
    try:
        if not spec.get("pages"):
            raise SpecError("spec has no pages")
        seen = set()
        for ps in spec["pages"]:
            if ps["name"] in seen:
                raise SpecError("duplicate page name %s" % ps["name"])
            seen.add(ps["name"])
            pb = PageBuilder(ps, proj, theme)
            comps = pb.build()
            back = theme.color(ps.get("back", "@bg"))
            xml = serialize_page(pb.name, comps, proj["width"], proj["height"], back,
                                 int(ps.get("refresh", spec.get("refresh", 250))))
            fname = pb.name + ".TGD"
            with open(os.path.join(args.out, fname), "w", encoding="utf-8") as fh:
                fh.write(xml)
            built.append(os.path.join(args.out, fname))
    except SpecError as e:
        print("SPEC ERROR: %s" % e, file=sys.stderr)
        return 2

    pages = [read_tgd(p) for p in built]
    errors, warnings = validate_pages(pages)
    report(errors, warnings)

    startup = proj.get("startup", pages[0]["name"])
    if args.tgm:
        tgm = ['<?xml version="1.0" encoding="utf-8"?>', "<TGM>",
               '  <Device StartupPage="%s" ScreenResolution="%d,%d">' % (startup, proj["width"], proj["height"]),
               "    <Pages>"] + ['      <Page File="%s" />' % p["file"] for p in pages] + \
              ["    </Pages>", "    <Images />", "  </Device>", "</TGM>", ""]
        with open(os.path.join(args.out, proj["name"] + ".TGM"), "w", encoding="utf-8") as fh:
            fh.write("\n".join(tgm))

    sim = spec.get("sim", {})
    sim.setdefault("vars", spec.get("vars", {}))
    with open(os.path.join(args.out, "VR_MAP.md"), "w", encoding="utf-8") as fh:
        fh.write(vr_map_markdown(proj["name"], collect_vr_usage(pages), sim["vars"]))

    if not args.no_preview:
        img_dirs = [args.out, os.path.dirname(os.path.abspath(args.spec))] + \
                   [os.path.join(os.path.dirname(os.path.abspath(args.spec)), d) for d in spec.get("imageDirs", [])]
        missing = build_preview(pages, os.path.join(args.out, "preview.html"), proj["name"], startup, sim, img_dirs)
        for m in missing:
            print("warning image %s not found; preview shows a placeholder" % m, file=sys.stderr)

    print("Wrote %d page(s) to %s: %s" % (len(pages), args.out, ", ".join(p["file"] for p in pages)))
    if not args.no_preview:
        print("Preview: %s" % os.path.join(args.out, "preview.html"))
    return 1 if errors else 0


def _expand(files):
    out = []
    for f in files:
        if os.path.isdir(f):
            out += sorted(os.path.join(f, n) for n in os.listdir(f) if n.lower().endswith(".tgd"))
        else:
            out.append(f)
    return out


def cmd_preview(args):
    files = _expand(args.files)
    pages = [read_tgd(f) for f in files]
    if not pages:
        print("No TGD files given", file=sys.stderr)
        return 2
    sim = {}
    if args.sim:
        with open(args.sim, encoding="utf-8") as fh:
            sim = json.load(fh)
    dirs = sorted({os.path.dirname(os.path.abspath(f)) for f in files}) + (args.images or [])
    missing = build_preview(pages, args.out, args.title or "HMI Preview", args.startup, sim, dirs)
    for m in missing:
        print("warning image %s not found" % m, file=sys.stderr)
    errors, warnings = validate_pages(pages)
    report(errors, warnings)
    print("Preview: %s" % args.out)
    return 0


def cmd_validate(args):
    pages = [read_tgd(f) for f in _expand(args.files)]
    errors, warnings = validate_pages(pages, args.min_touch)
    report(errors, warnings, sys.stdout)
    return 1 if errors else 0


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build", help="JSON spec -> TGD pages + preview.html + VR_MAP.md")
    b.add_argument("spec")
    b.add_argument("-o", "--out", default="hmi_out")
    b.add_argument("--no-preview", action="store_true")
    b.add_argument("--tgm", action="store_true", help="also write a minimal <name>.TGM project manifest")
    b.set_defaults(fn=cmd_build)
    p = sub.add_parser("preview", help="existing TGD files/folders -> interactive preview.html")
    p.add_argument("files", nargs="+")
    p.add_argument("-o", "--out", default="preview.html")
    p.add_argument("--sim", help="JSON with {init, rules, vars} for simulated controller behaviour")
    p.add_argument("--startup")
    p.add_argument("--title")
    p.add_argument("--images", nargs="*", help="extra folders to search for images")
    p.set_defaults(fn=cmd_preview)
    v = sub.add_parser("validate", help="lint TGD files")
    v.add_argument("files", nargs="+")
    v.add_argument("--min-touch", type=int, default=40)
    v.set_defaults(fn=cmd_validate)
    args = ap.parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    sys.exit(main())
