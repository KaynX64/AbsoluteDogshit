const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const { test } = require('node:test');

const windowModulePath = require.resolve('../electron/window.cjs');

function createWindowFixture(isPackaged = false) {
  let createdWindow;
  const defaultSession = {
    setPermissionRequestHandler() {},
    setPermissionCheckHandler() {},
  };
  class FakeBrowserWindow extends EventEmitter {
    constructor(options) {
      super();
      this.options = options;
      this.visible = false;
      this.webContents = new EventEmitter();
      this.webContents.session = new EventEmitter();
      this.webContents.setWindowOpenHandler = () => {};
      createdWindow = this;
    }

    removeMenu() {}
    loadURL() {}
    loadFile() {}
    setTitle() {}
    show() { this.visible = true; }
    focus() {}
    isVisible() { return this.visible; }
    isDestroyed() { return false; }
    isFullScreen() { return false; }
    setFullScreen() {}
  }

  const electron = {
    app: { isPackaged, getPath: () => 'fixture' },
    BrowserWindow: FakeBrowserWindow,
    Menu: { setApplicationMenu() {} },
    shell: { openExternal: () => Promise.resolve(), showItemInFolder() {} },
    session: { defaultSession },
    nativeTheme: Object.assign(new EventEmitter(), { shouldUseDarkColors: false }),
    ipcMain: { on() {} },
  };
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electron;
    if (request === './updates.cjs' && parent.filename === windowModulePath) {
      return { setupAutoUpdater() {} };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    delete require.cache[windowModulePath];
    const { createWindow } = require(windowModulePath);
    createWindow();
  } finally {
    Module._load = originalLoad;
  }
  return createdWindow;
}

test('dev window appears after the page loads without ready-to-show', () => {
  const win = createWindowFixture();
  assert.equal(win.visible, false);

  win.webContents.emit('did-finish-load');

  assert.equal(win.visible, true);
});

test('packaged window still appears on ready-to-show', () => {
  const win = createWindowFixture(true);
  assert.equal(win.visible, false);

  win.emit('ready-to-show');

  assert.equal(win.visible, true);
});
