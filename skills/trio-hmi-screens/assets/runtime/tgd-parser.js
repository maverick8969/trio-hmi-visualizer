// ============================================================
// tgd-parser.js — Parse .TGD XML into JS model
// ============================================================

function parseTGD(xmlString, fileName) {
  // Strip namespace to simplify querySelector usage
  const cleanXml = xmlString.replace(/xmlns="[^"]*"/g, '');
  const parser = new DOMParser();
  const doc = parser.parseFromString(cleanXml, 'text/xml');

  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    console.error('TGD parse error:', parseError.textContent);
    return null;
  }

  const tgdEl = doc.querySelector('TGD');
  const formEl = doc.querySelector('form');

  const page = {
    fileName: fileName || 'unknown.TGD',
    pageName: (fileName || '').replace(/\.TGD$/i, ''),
    width: parseInt(getElText(formEl, 'width')) || 1024,
    height: parseInt(getElText(formEl, 'height')) || 600,
    backColor: getElText(formEl, 'backcolor') || '#FFF0F0F0',
    bindingRefreshPeriod: parseInt(getElText(formEl, 'bindingrefreshperiod')) || 250,
    verMajor: tgdEl ? tgdEl.getAttribute('VerMajor') : '1',
    verMinor: tgdEl ? tgdEl.getAttribute('VerMinor') : '1',
    minClientVersion: tgdEl ? tgdEl.getAttribute('MinClientVersion') : '',
    designerVersion: tgdEl ? tgdEl.getAttribute('DesignerVersion') : '',
    formComponent: null,
    components: []
  };

  // Parse form-level component (HMIEditorControl)
  const formComp = formEl ? formEl.querySelector('component') : null;
  if (formComp) {
    page.formComponent = parseComponent(formComp);
  }

  // Parse all components
  const compsEl = doc.querySelector('components');
  if (compsEl) {
    const compEls = compsEl.querySelectorAll(':scope > component');
    compEls.forEach((el, idx) => {
      const comp = parseComponent(el);
      comp._zIndex = idx;
      page.components.push(comp);
    });
  }

  return page;
}

function parseComponent(el) {
  const comp = {
    assembly: getElText(el, ':scope > assembly') || 'HMIClient',
    type: shortType(getElText(el, ':scope > type') || ''),
    fullType: getElText(el, ':scope > type') || '',
    name: getElText(el, ':scope > name') || '',
    isPopup: el.getAttribute('popup') === 'true',
    properties: {},
    events: [],
    _zIndex: 0
  };

  // Parse properties
  const propsEl = el.querySelector(':scope > properties');
  if (propsEl) {
    const propEls = propsEl.querySelectorAll(':scope > property');
    propEls.forEach(propEl => {
      const prop = parseProperty(propEl);
      if (prop) comp.properties[prop.name] = prop;
    });
  }

  // Parse events
  const eventsEl = el.querySelector(':scope > events');
  if (eventsEl) {
    const eventEls = eventsEl.querySelectorAll(':scope > event');
    eventEls.forEach(eventEl => {
      const evt = {
        name: getElText(eventEl, 'name') || '',
        actions: []
      };
      const actionsEl = eventEl.querySelector('actions');
      if (actionsEl) {
        actionsEl.querySelectorAll('action').forEach(actEl => {
          evt.actions.push(actEl.textContent.trim());
        });
      }
      comp.events.push(evt);
    });
  }

  return comp;
}

function parseProperty(propEl) {
  const name = getElText(propEl, 'name');
  const typeName = getElText(propEl, 'type') || '';
  const valueEl = propEl.querySelector('value');
  const rawValue = valueEl ? valueEl.innerHTML.trim() : '';
  const preserveSpace = valueEl && valueEl.getAttribute('xml:space') === 'preserve';

  let value = parsePropertyValue(typeName, valueEl, rawValue);

  // Parse binding
  let binding = null;
  const bindingEl = propEl.querySelector('binding');
  if (bindingEl) {
    binding = {
      mcsource: getElText(bindingEl, 'mcsource') || '',
      mode: getElText(bindingEl, 'mode') || 'ReadOnly',
      writeEvent: getElText(bindingEl, 'write_event') || null
    };
  }

  return {
    name: name,
    typeName: typeName,
    value: value,
    rawValue: rawValue,
    preserveSpace: preserveSpace,
    binding: binding
  };
}

function parsePropertyValue(typeName, valueEl, rawValue) {
  if (!valueEl) return rawValue;

  switch (typeName) {
    case 'System.Int32':
      return parseInt(rawValue) || 0;
    case 'System.Double':
      return parseFloat(rawValue) || 0;
    case 'System.Boolean':
      return rawValue === 'True' || rawValue === 'true';
    case 'System.String':
      return valueEl.textContent || '';
    case 'System.Drawing.Color':
      return rawValue; // Keep as #AARRGGBB
    case 'System.Drawing.Font':
      return valueEl.textContent.trim(); // "DejaVu Sans:20:0"
    case 'System.Drawing.ContentAlignment':
    case 'System.Windows.Forms.HorizontalAlignment':
    case 'System.Windows.Forms.BorderStyle':
    case 'Trio.HMI.Controls.TVBTextFormat':
    case 'System.Windows.Forms.Orientation':
      return rawValue; // Keep as string enum
    case 'System.Drawing.Image':
      return rawValue; // Filename string
    case 'System.Drawing.Image[]':
      return parseImageArray(valueEl);
    case 'Trio.HMI.Controls.TVBDataGridColumnBase[]':
      return parseDataGridColumns(valueEl);
    case 'System.Object[]':
      return rawValue; // Placeholder for table data
    case 'Trio.HMI.Support.Padding':
      return rawValue; // "2,2,2,2"
    default:
      return rawValue;
  }
}

function parseImageArray(valueEl) {
  const images = [];
  const arrayEl = valueEl.querySelector('array');
  if (arrayEl) {
    arrayEl.querySelectorAll('element').forEach(el => {
      images.push(el.textContent.trim());
    });
  }
  return images;
}

function parseDataGridColumns(valueEl) {
  const columns = [];
  const arrayEl = valueEl.querySelector('array');
  if (arrayEl) {
    arrayEl.querySelectorAll(':scope > element').forEach(el => {
      const compEl = el.querySelector('component');
      if (compEl) {
        columns.push(parseComponent(compEl));
      }
    });
  }
  return columns;
}

// Helper: get text content of first matching child element
function getElText(parent, selector) {
  if (!parent) return '';
  const el = parent.querySelector(selector);
  return el ? el.textContent.trim() : '';
}
