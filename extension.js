const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const util = require('node:util');
const childProcess = require('node:child_process');
const {
  buildStateDocUrl,
  compactDocstring,
  createSignature,
  findSaltStateIdentifier,
} = require('./lib/saltStateHover');

const execFileAsync = util.promisify(childProcess.execFile);
const CACHE_FILE_NAME = 'salt-state-docs.json';

function getHoverSettings() {
  const config = vscode.workspace.getConfiguration('saltstack.hover');
  return {
    configPath: config.get('configPath', '/etc/salt/minion'),
    docsStrategy: config.get('docsStrategy', 'auto'),
    docsVersion: config.get('docsVersion', 'latest'),
    enabled: config.get('enabled', true),
    localMode: config.get('localMode', false),
    pythonPath: config.get('pythonPath', 'python3'),
  };
}

function getCacheSettingsKey(settings) {
  return JSON.stringify({
    configPath: settings.configPath,
    docsStrategy: settings.docsStrategy,
    localMode: settings.localMode,
    pythonPath: settings.pythonPath,
  });
}

async function readJsonIfExists(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return null;
    }
    return null;
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function loadCachedEntries(context, settings) {
  const cachePath = path.join(context.globalStorageUri.fsPath, CACHE_FILE_NAME);
  const cached = await readJsonIfExists(cachePath);
  if (!cached || cached?._meta?.settingsKey !== getCacheSettingsKey(settings)) {
    return null;
  }
  return cached.entries ?? {};
}

async function generateEntriesViaPython(context, settings, outputChannel) {
  const cachePath = path.join(context.globalStorageUri.fsPath, CACHE_FILE_NAME);
  const scriptPath = path.join(context.extensionPath, 'scripts', 'export_state_hover_docs.py');
  const args = [scriptPath, '--config', settings.configPath, '--strategy', settings.docsStrategy];
  if (settings.localMode) {
    args.push('--local');
  }

  outputChannel.appendLine(`Generating Salt hover docs via ${settings.pythonPath}`);
  const { stdout, stderr } = await execFileAsync(settings.pythonPath, args, {
    timeout: 30000,
    maxBuffer: 10 * 1024 * 1024,
  });

  if (stderr && stderr.trim()) {
    outputChannel.appendLine(stderr.trim());
  }

  const payload = JSON.parse(stdout);
  payload._meta = {
    ...(payload._meta ?? {}),
    settingsKey: getCacheSettingsKey(settings),
  };

  await writeJson(cachePath, payload);
  return payload.entries ?? {};
}

function createDocLoader(context, outputChannel) {
  let docsPromise = null;
  let settingsKey = null;

  return async function getEntries() {
    const settings = getHoverSettings();
    if (!settings.enabled) {
      return {};
    }

    const nextSettingsKey = getCacheSettingsKey(settings);
    if (!docsPromise || settingsKey !== nextSettingsKey) {
      settingsKey = nextSettingsKey;
      docsPromise = (async () => {
        const cachedEntries = await loadCachedEntries(context, settings);
        if (cachedEntries) {
          return cachedEntries;
        }

        try {
          return await generateEntriesViaPython(context, settings, outputChannel);
        } catch (error) {
          outputChannel.appendLine(`Failed to generate Salt hover docs: ${error.message}`);
          return {};
        }
      })();
    }

    return docsPromise;
  };
}

function activate(context) {
  const outputChannel = vscode.window.createOutputChannel('SaltStack');
  const getEntries = createDocLoader(context, outputChannel);

  const provider = {
    async provideHover(document, position) {
      const match = findSaltStateIdentifier(document.lineAt(position.line).text, position.character);
      if (!match) {
        return undefined;
      }

      const entries = await getEntries();
      const entry = entries[match.symbol];
      if (!entry) {
        return undefined;
      }

      const settings = getHoverSettings();
      const markdown = new vscode.MarkdownString(undefined, true);
      markdown.appendCodeblock(createSignature(match.symbol, entry.args), 'text');

      const docstring = compactDocstring(entry.doc);
      if (docstring) {
        markdown.appendMarkdown('\n\n');
        markdown.appendText(docstring);
      }

      markdown.appendMarkdown(`\n\n[Salt state docs](${buildStateDocUrl(match.symbol, settings.docsVersion)})`);

      return new vscode.Hover(
        markdown,
        new vscode.Range(position.line, match.start, position.line, match.end),
      );
    },
  };

  context.subscriptions.push(outputChannel);
  context.subscriptions.push(vscode.languages.registerHoverProvider(['sls', 'saltcheck'], provider));
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};