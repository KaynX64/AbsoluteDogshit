const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const Module = require('node:module');
const path = require('node:path');
const { test } = require('node:test');
const { WINDOWS_APP_ID } = require('../electron/config.cjs');
const { build } = require('../package.json');

const windowModulePath = require.resolve('../electron/window.cjs');
const fixtureAppPath = path.join(__dirname, 'fixture project');

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
    setAppDetails(details) { this.appDetails = details; }
    show() { this.visible = true; }
    focus() {}
    isVisible() { return this.visible; }
    isDestroyed() { return false; }
    isFullScreen() { return false; }
    setFullScreen() {}
  }

  const electron = {
    app: {
      isPackaged,
      getName: () => 'HealthLink',
      getAppPath: () => fixtureAppPath,
      getPath: () => 'fixture',
    },
    BrowserWindow: FakeBrowserWindow,
    Menu: { setApplicationMenu() {} },
    shell: { openExternal: () => Promise.resolve(), showItemInFolder() {} },
    session: { defaultSession },
    nativeTheme: Object.assign(new EventEmitter(), { shouldUseDarkColors: false }),
    ipcMain: { on() {} },
  };
  const originalLoad = Module._load;
  const originalResourcesPath = process.resourcesPath;
  process.resourcesPath = path.join(__dirname, 'packaged-resources');
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
    if (originalResourcesPath === undefined) delete process.resourcesPath;
    else process.resourcesPath = originalResourcesPath;
  }
  return createdWindow;
}

test('dev window appears after the page loads without ready-to-show', () => {
  const win = createWindowFixture();
  if (process.platform === 'win32') assert.equal(win.options.icon, path.resolve(__dirname, '../src/assets/valetudo_icon.ico'));
  assert.equal(win.visible, false);

  win.webContents.emit('did-finish-load');

  assert.equal(win.visible, true);
});

test('packaged window still appears on ready-to-show', () => {
  assert.equal(WINDOWS_APP_ID, build.appId);
  const win = createWindowFixture(true);
  if (process.platform === 'win32') assert.equal(win.options.icon, path.join(__dirname, 'packaged-resources', 'valetudo_icon.ico'));
  assert.equal(win.visible, false);

  win.emit('ready-to-show');

  assert.equal(win.visible, true);
});

test('Windows taskbar pins use the HealthLink icon and the correct launch target', { skip: process.platform !== 'win32' }, () => {
  const installed = createWindowFixture(true);
  const development = createWindowFixture();
  assert.deepEqual(installed.appDetails, {
    appId: build.appId,
    appIconPath: installed.options.icon,
    relaunchCommand: `"${process.execPath}"`,
    relaunchDisplayName: 'HealthLink',
  });
  assert.deepEqual(development.appDetails, {
    appId: `${build.appId}.dev`,
    appIconPath: development.options.icon,
    relaunchCommand: `"${process.execPath}" "${fixtureAppPath}"`,
    relaunchDisplayName: 'HealthLink (Development)',
  });
});
