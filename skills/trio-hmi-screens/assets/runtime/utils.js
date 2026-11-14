// ============================================================
// utils.js — Color, font, alignment conversion utilities
// ============================================================

/**
 * Convert TGD #AARRGGBB color to CSS rgba().
 * TGD format: #AARRGGBB (alpha first after #)
 * CSS format: rgba(R, G, B, A)
 */
function tgdColorToCSS(c) {
  if (!c || c.length !== 9 || c[0] !== '#') return c || 'transparent';
  const a = parseInt(c.substring(1, 3), 16) / 255;
  const r = parseInt(c.substring(3, 5), 16);
  const g = parseInt(c.substring(5, 7), 16);
  const b = parseInt(c.substring(7, 9), 16);
  if (a === 0) return 'transparent';
  return `rgba(${r},${g},${b},${a.toFixed(3)})`;
}

/**
 * Convert CSS rgba/hex back to TGD #AARRGGBB format.
 */
function cssColorToTGD(css) {
  if (!css || css === 'transparent') return '#00000000';
  if (css.startsWith('#') && css.length === 9) return css; // already TGD format
  if (css.startsWith('rgba(')) {
    const m = css.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (m) {
      const a = Math.round(parseFloat(m[4]) * 255).toString(16).padStart(2, '0').toUpperCase();
      const r = parseInt(m[1]).toString(16).padStart(2, '0').toUpperCase();
      const g = parseInt(m[2]).toString(16).padStart(2, '0').toUpperCase();
      const b = parseInt(m[3]).toString(16).padStart(2, '0').toUpperCase();
      return `#${a}${r}${g}${b}`;
    }
  }
  return css;
}

/**
 * Parse TGD font string "DejaVu Sans:20:0" into CSS properties.
 * Style bitmask: 0=normal, 1=bold, 2=italic, 3=bold+italic
 */
function parseTGDFont(fontStr) {
  if (!fontStr) return { family: 'sans-serif', size: 20, weight: 'normal', style: 'normal', raw: '' };
  const parts = fontStr.split(':');
  const family = parts[0] || 'DejaVu Sans';
  const size = parseInt(parts[1]) || 20;
  const styleBits = parseInt(parts[2]) || 0;
  return {
    family: family,
    size: size,
    weight: (styleBits & 1) ? 'bold' : 'normal',
    style: (styleBits & 2) ? 'italic' : 'normal',
    raw: fontStr
  };
}

/**
 * Apply parsed font to a DOM element.
 */
function applyFont(el, fontStr) {
  const f = parseTGDFont(fontStr);
  el.style.fontFamily = `"${f.family}", "DejaVu Sans", "Segoe UI", Arial, sans-serif`;
  el.style.fontSize = f.size + 'px';
  el.style.fontWeight = f.weight;
  el.style.fontStyle = f.style;
}

/**
 * ContentAlignment → CSS flexbox properties.
 * Values: TopLeft, TopCenter, TopRight, MiddleLeft, MiddleCenter, MiddleRight, BottomLeft, BottomCenter, BottomRight
 */
const ALIGNMENT_MAP = {
  'TopLeft':      { justify: 'flex-start', align: 'flex-start', textAlign: 'left' },
  'TopCenter':    { justify: 'flex-start', align: 'center',     textAlign: 'center' },
  'TopRight':     { justify: 'flex-start', align: 'flex-end',   textAlign: 'right' },
  'MiddleLeft':   { justify: 'center',     align: 'flex-start', textAlign: 'left' },
  'MiddleCenter': { justify: 'center',     align: 'center',     textAlign: 'center' },
  'MiddleRight':  { justify: 'center',     align: 'flex-end',   textAlign: 'right' },
  'BottomLeft':   { justify: 'flex-end',   align: 'flex-start', textAlign: 'left' },
  'BottomCenter': { justify: 'flex-end',   align: 'center',     textAlign: 'center' },
  'BottomRight':  { justify: 'flex-end',   align: 'flex-end',   textAlign: 'right' },
};

function applyAlignment(el, alignStr) {
  const a = ALIGNMENT_MAP[alignStr] || ALIGNMENT_MAP['TopLeft'];
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.justifyContent = a.justify;
  el.style.alignItems = a.align;
  el.style.textAlign = a.textAlign;
}

/**
 * HorizontalAlignment for TextBox → CSS text-align.
 */
function applyHAlign(el, alignStr) {
  const map = { 'Left': 'left', 'Center': 'center', 'Right': 'right' };
  el.style.textAlign = map[alignStr] || 'left';
}

/**
 * Format a number per TGD format type.
 */
function formatValue(value, formatType, formatNumDP, formatWidth) {
  if (value === null || value === undefined) return '';
  const num = parseFloat(value);
  if (isNaN(num)) return String(value);
  if (formatType === 'FORMAT_REAL') {
    const dp = (formatNumDP !== undefined && formatNumDP !== null) ? formatNumDP : 2;
    let s = num.toFixed(dp);
    if (formatWidth && s.length < formatWidth) s = s.padStart(formatWidth);
    return s;
  }
  if (formatType === 'FORMAT_INTEGER') {
    let s = Math.round(num).toString();
    if (formatWidth && s.length < formatWidth) s = s.padStart(formatWidth);
    return s;
  }
  return String(value);
}

/**
 * Parse a TGD Padding string "2,2,2,2" into {top, left, bottom, right}.
 */
function parsePadding(str) {
  if (!str) return { top: 0, left: 0, bottom: 0, right: 0 };
  const parts = str.split(',').map(Number);
  return { top: parts[0] || 0, left: parts[1] || 0, bottom: parts[2] || 0, right: parts[3] || 0 };
}

/**
 * Get a property value from a component's properties map.
 */
function getProp(comp, name, defaultVal) {
  const p = comp.properties[name];
  if (p === undefined) return defaultVal;
  return p.value !== undefined ? p.value : defaultVal;
}

/**
 * Get a property's binding from a component's properties map.
 */
function getBinding(comp, name) {
  const p = comp.properties[name];
  return p ? p.binding : null;
}

/**
 * Get the short type name from a full Trio type string.
 */
function shortType(fullType) {
  if (!fullType) return '';
  const parts = fullType.split('.');
  return parts[parts.length - 1];
}
