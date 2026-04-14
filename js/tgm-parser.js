// ============================================================
// tgm-parser.js — Parse .TGM project manifest
// ============================================================

function parseTGM(xmlString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  const deviceEl = doc.querySelector('Device');
  if (!deviceEl) return null;

  const project = {
    startupPage: deviceEl.getAttribute('StartupPage') || '',
    screenResolution: deviceEl.getAttribute('ScreenResolution') || '1024,600',
    minClientVersion: deviceEl.getAttribute('MinClientVersion') || '',
    designerVersion: deviceEl.getAttribute('DesignerVersion') || '',
    pages: [],
    images: [],
    componentDefaults: {}
  };

  // Parse pages
  doc.querySelectorAll('Pages > Page').forEach(el => {
    project.pages.push(el.getAttribute('File'));
  });

  // Parse images
  doc.querySelectorAll('Images > Image').forEach(el => {
    project.images.push(el.getAttribute('File'));
  });

  // Parse component type defaults from TGT section
  doc.querySelectorAll('TGT > Assemblies > Assembly > Components > Component').forEach(compEl => {
    const typeEl = compEl.querySelector('Type');
    if (!typeEl) return;
    const fullType = typeEl.textContent.trim();
    const typeName = shortType(fullType);
    const defaults = {};

    compEl.querySelectorAll('Properties > Property').forEach(propEl => {
      const nameEl = propEl.querySelector('Name');
      const defEl = propEl.querySelector('DefaultValue');
      if (nameEl && defEl) {
        const typeStr = propEl.querySelector('Type') ? propEl.querySelector('Type').textContent.trim() : '';
        defaults[nameEl.textContent.trim()] = {
          typeName: typeStr,
          value: defEl.textContent.trim()
        };
      }
    });

    project.componentDefaults[typeName] = defaults;
  });

  return project;
}
