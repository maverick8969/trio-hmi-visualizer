// ============================================================
// image-store.js — Manages loaded PNG images as data URLs
// ============================================================

class ImageStore {
  constructor() {
    this._images = {};  // filename -> data URL
  }

  async loadFromFile(file) {
    if (!file.name.match(/\.(png|jpg|jpeg|gif|bmp)$/i)) return;
    const dataUrl = await this._readAsDataURL(file);
    this._images[file.name] = dataUrl;
    // Also store without path for flexibility
    const basename = file.name.split('/').pop().split('\\').pop();
    this._images[basename] = dataUrl;
  }

  async loadFromFiles(fileList) {
    const promises = [];
    for (const file of fileList) {
      if (file.name.match(/\.(png|jpg|jpeg|gif|bmp)$/i)) {
        promises.push(this.loadFromFile(file));
      }
    }
    await Promise.all(promises);
  }

  getImageUrl(filename) {
    if (!filename) return null;
    return this._images[filename] || this._images[filename.split('/').pop()] || null;
  }

  hasImage(filename) {
    return !!this.getImageUrl(filename);
  }

  getLoadedCount() {
    // Unique data URLs (filenames may duplicate with/without path)
    return new Set(Object.values(this._images)).size;
  }

  _readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

const imageStore = new ImageStore();
