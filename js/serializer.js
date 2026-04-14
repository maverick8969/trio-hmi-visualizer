// ============================================================
// serializer.js — Export page model back to valid .TGD XML
// ============================================================

function serializePage(page) {
  const ns = 'triomotion:hmi:tgd';
  let xml = '<?xml version="1.0" encoding="utf-8"?>\n';
  xml += `<TGD VerMajor="${page.verMajor || '1'}" VerMinor="${page.verMinor || '1'}"`;
  if (page.minClientVersion) xml += ` MinClientVersion="${page.minClientVersion}"`;
  if (page.designerVersion) xml += ` DesignerVersion="${page.designerVersion}"`;
  xml += ` xmlns="${ns}">\n`;

  // Form section
  xml += '  <form>\n';
  xml += `    <top>0</top>\n`;
  xml += `    <left>0</left>\n`;
  xml += `    <width>${page.width}</width>\n`;
  xml += `    <height>${page.height}</height>\n`;
  xml += `    <backcolor>${page.backColor}</backcolor>\n`;
  xml += `    <bindingrefreshperiod>${page.bindingRefreshPeriod}</bindingrefreshperiod>\n`;

  // Form component (HMIEditorControl)
  if (page.formComponent) {
    xml += serializeComponent(page.formComponent, '    ', true);
  } else {
    xml += '    <component>\n';
    xml += '      <type>Trio.HMIComponents.Editor.HMIEditorControl</type>\n';
    xml += '      <name>Page</name>\n';
    xml += '      <properties>\n';
    xml += serializeProperty('BackColor', 'System.Drawing.Color', page.backColor, null, '        ');
    xml += serializeProperty('BindingRefreshPeriod', 'System.Int32', page.bindingRefreshPeriod, null, '        ');
    xml += '      </properties>\n';
    xml += '    </component>\n';
  }
  xml += '  </form>\n';

  // Components
  xml += '  <components>\n';
  page.components.forEach(comp => {
    xml += serializeComponent(comp, '    ', false);
  });
  xml += '  </components>\n';

  xml += '</TGD>';
  return xml;
}

function serializeComponent(comp, indent, isFormComp) {
  let xml = '';
  const i = indent;
  const i2 = indent + '  ';
  const i3 = indent + '    ';

  if (comp.isPopup) {
    xml += `${i}<component popup="true">\n`;
  } else {
    xml += `${i}<component>\n`;
  }

  if (!isFormComp) {
    xml += `${i2}<assembly>${comp.assembly || 'HMIClient'}</assembly>\n`;
  }
  xml += `${i2}<type>${comp.fullType || ('Trio.HMI.Controls.' + comp.type)}</type>\n`;
  xml += `${i2}<name>${escXml(comp.name)}</name>\n`;

  // Properties
  const propNames = Object.keys(comp.properties);
  if (propNames.length > 0) {
    xml += `${i2}<properties>\n`;
    propNames.forEach(propName => {
      const prop = comp.properties[propName];
      if (prop.name === 'Name' && !isFormComp) {
        // Name is already in <name> element, but also include as property
      }
      xml += serializePropertyFull(prop, i3);
    });
    xml += `${i2}</properties>\n`;
  }

  // Events
  if (comp.events && comp.events.length > 0) {
    xml += `${i2}<events>\n`;
    comp.events.forEach(evt => {
      xml += `${i3}<event>\n`;
      xml += `${i3}  <name>${escXml(evt.name)}</name>\n`;
      if (evt.actions && evt.actions.length > 0) {
        xml += `${i3}  <actions>\n`;
        evt.actions.forEach(action => {
          xml += `${i3}    <action>${escXml(action)}</action>\n`;
        });
        xml += `${i3}  </actions>\n`;
      }
      xml += `${i3}</event>\n`;
    });
    xml += `${i2}</events>\n`;
  }

  xml += `${i}</component>\n`;
  return xml;
}

function serializePropertyFull(prop, indent) {
  const i = indent;
  const i2 = indent + '  ';
  let xml = `${i}<property>\n`;
  xml += `${i2}<name>${escXml(prop.name)}</name>\n`;
  xml += `${i2}<type>${escXml(prop.typeName)}</type>\n`;

  // Value
  const val = serializePropertyValue(prop);
  if (prop.preserveSpace) {
    xml += `${i2}<value xml:space="preserve">${val}</value>\n`;
  } else if (val.includes('<')) {
    // Complex value (arrays, nested components)
    xml += `${i2}<value>${val}</value>\n`;
  } else {
    xml += `${i2}<value>${val}</value>\n`;
  }

  // Binding
  if (prop.binding) {
    xml += `${i2}<binding>\n`;
    xml += `${i2}  <mcsource>${escXml(prop.binding.mcsource)}</mcsource>\n`;
    xml += `${i2}  <mode>${prop.binding.mode}</mode>\n`;
    if (prop.binding.writeEvent) {
      xml += `${i2}  <write_event>${prop.binding.writeEvent}</write_event>\n`;
    }
    xml += `${i2}</binding>\n`;
  }

  xml += `${i}</property>\n`;
  return xml;
}

function serializePropertyValue(prop) {
  const typeName = prop.typeName;
  const value = prop.value;

  // For simple types, convert value back to string
  switch (typeName) {
    case 'System.Int32':
      return String(Math.round(value) || 0);
    case 'System.Double':
      return String(value || 0);
    case 'System.Boolean':
      return value ? 'True' : 'False';
    case 'System.Drawing.Image[]':
      if (Array.isArray(value)) {
        let xml = `\n            <array dims="${value.length}">`;
        value.forEach((img, i) => {
          xml += `\n              <element index="${i}">${escXml(img)}</element>`;
        });
        xml += '\n            </array>\n          ';
        return xml;
      }
      return prop.rawValue || '';
    case 'Trio.HMI.Controls.TVBDataGridColumnBase[]':
      if (Array.isArray(value)) {
        let xml = `\n            <array dims="${value.length}">`;
        value.forEach((col, i) => {
          xml += `\n              <element index="${i}">`;
          xml += '\n' + serializeComponent(col, '                ', false);
          xml += `              </element>`;
        });
        xml += '\n            </array>\n          ';
        return xml;
      }
      return prop.rawValue || '';
    default:
      // For strings and enums, return as-is
      if (value === null || value === undefined) return '';
      return escXml(String(value));
  }
}

function serializeProperty(name, type, value, binding, indent) {
  let xml = `${indent}<property>\n`;
  xml += `${indent}  <name>${name}</name>\n`;
  xml += `${indent}  <type>${type}</type>\n`;
  xml += `${indent}  <value>${escXml(String(value))}</value>\n`;
  xml += `${indent}</property>\n`;
  return xml;
}

function escXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
