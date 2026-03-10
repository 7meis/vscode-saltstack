import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import test, { before } from 'node:test';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const vsCodeNodeModules = findExistingPath([
  path.join(repoRoot, 'node_modules'),
  '/Applications/Visual Studio Code.app/Contents/Resources/app/node_modules',
]);
const vsCodeExtensions = '/Applications/Visual Studio Code.app/Contents/Resources/app/extensions';

let registry;
let textmate;

before(async () => {
  assert.ok(vsCodeNodeModules, 'VS Code node_modules or local node_modules must exist for grammar tokenization tests');
  const oniguruma = require(path.join(vsCodeNodeModules, 'vscode-oniguruma'));
  textmate = require(path.join(vsCodeNodeModules, 'vscode-textmate'));
  const wasmPath = path.join(vsCodeNodeModules, 'vscode-oniguruma', 'release', 'onig.wasm');
  const wasmBytes = fs.readFileSync(wasmPath);
  const wasmBuffer = wasmBytes.buffer.slice(wasmBytes.byteOffset, wasmBytes.byteOffset + wasmBytes.byteLength);
  await oniguruma.loadWASM(wasmBuffer);

  const onigLib = Promise.resolve({
    createOnigScanner(patterns) {
      return new oniguruma.OnigScanner(patterns);
    },
    createOnigString(text) {
      return new oniguruma.OnigString(text);
    },
  });

  const scopeToFile = buildScopeFileMap();
  registry = new textmate.Registry({
    onigLib,
    loadGrammar: async (scopeName) => {
      const filePath = scopeToFile.get(scopeName);
      if (!filePath) {
        return null;
      }
      return textmate.parseRawGrammar(fs.readFileSync(filePath, 'utf8'), filePath);
    },
    getInjections: (scopeName) => (scopeName === 'text.yaml.jinja' ? ['text.yaml.jinja.injection'] : []),
  });
});

test('YAML comments containing Jinja-like text stay comments only', async () => {
  const lines = await tokenize('text.yaml.jinja', ['# {{ grains.id }}', '# {% if grains.id %}', 'pkg.installed:']);

  assert.ok(lineHasScope(lines[0], 'comment.line.number-sign.yaml'));
  assert.ok(lineHasScope(lines[1], 'comment.line.number-sign.yaml'));
  assert.equal(lineHasScope(lines[0], 'source.jinja'), false);
  assert.equal(lineHasScope(lines[1], 'source.jinja'), false);
  assert.equal(lineHasScope(lines[2], 'source.jinja'), false);
  assert.ok(lines[2].length > 0);
});

test('comment lines keep jinja-like punctuation fully inside YAML comment scope', async () => {
  const line = '# {% if grains[\'os_family\'] == \'Debian\' %}';
  const [tokens] = await tokenize('text.yaml.jinja', [line]);

  assert.ok(tokens.length > 0);
  assert.ok(tokens.every((token) => token.scopes.some((scope) => scope.includes('comment.line.number-sign.yaml'))));
  assert.equal(lineHasScope(tokens, 'source.jinja'), false);
  assert.equal(tokenTextHasScope(line, tokens, '{%','jinja'), false);
  assert.equal(tokenTextHasScope(line, tokens, '%}','jinja'), false);
});

test('leading comments, full-line Jinja, and inline Jinja remain stable together', async () => {
  const lines = await tokenize('text.yaml.jinja', [
    '# leading comment',
    '{% if grains["os"] == "Debian" %}',
    'pkg.installed:',
    '  - name: vim',
    '{% endif %}',
    'test.nop:',
    '  - name: {{ grains["id"] }}',
  ]);

  assert.ok(lineHasScope(lines[1], 'jinja'));
  assert.equal(lineHasScope(lines[2], 'source.jinja'), false);
  assert.ok(lines[2].length > 0);
  assert.ok(lineHasScope(lines[4], 'jinja'));
  assert.ok(lineHasScope(lines[6], 'jinja'));
  assert.equal(lineHasScope(lines[5], 'source.jinja'), false);
  assert.ok(lines[5].length > 0);
});

test('multiple leading comments and a blank line do not break following full-line Jinja', async () => {
  const lines = await tokenize('text.yaml.jinja', [
    '# Smoke test comment',
    '# {{ grains.id }}',
    '# {% if grains["os"] %}',
    '',
    '{% if grains["os_family"] == "Debian" %}',
    'pkg.installed:',
    '  - name: nginx',
    '{% endif %}',
  ]);

  assert.ok(lineHasScope(lines[0], 'comment.line.number-sign.yaml'));
  assert.ok(lineHasScope(lines[1], 'comment.line.number-sign.yaml'));
  assert.ok(lineHasScope(lines[2], 'comment.line.number-sign.yaml'));
  assert.equal(lineHasScope(lines[1], 'source.jinja'), false);
  assert.equal(lineHasScope(lines[2], 'source.jinja'), false);
  assert.ok(lineHasScope(lines[4], 'jinja'));
  assert.equal(lineHasScope(lines[5], 'source.jinja'), false);
  assert.ok(lines[5].length > 0);
  assert.ok(lineHasScope(lines[7], 'jinja'));
});

test('single-quoted full-line Jinja after multiple comments remains stable', async () => {
  const lines = await tokenize('text.yaml.jinja', [
    '# Smoke test: leading comments with Jinja-like text must stay comments.',
    '# {{ grains.id }}',
    '# {% if grains[\'os_family\'] == \'Debian\' %}',
    '',
    '{% if grains[\'os_family\'] == \'Debian\' %}',
    'install_nginx:',
    '  pkg.installed:',
    '    - version: {{ pillar.get(\'nginx:version\', \'latest\') }}',
    '{% endif %}',
  ]);

  assert.ok(lineHasScope(lines[2], 'comment.line.number-sign.yaml'));
  assert.equal(lineHasScope(lines[2], 'source.jinja'), false);
  assert.ok(lineHasScope(lines[4], 'jinja'));
  assert.equal(lineHasScope(lines[5], 'source.jinja'), false);
  assert.ok(lines[5].length > 0);
  assert.ok(lineHasScope(lines[7], 'jinja'));
  assert.ok(lineHasScope(lines[8], 'jinja'));
});

test('full smoke example with multiple leading comments and if-else block remains stable', async () => {
  const lines = await tokenize('text.yaml.jinja', [
    '# Smoke test: leading comments with Jinja-like text must stay comments.',
    '# {{ grains.id }}',
    '# {% if grains[\'os_family\'] == \'Debian\' %}',
    '',
    '{% if grains[\'os_family\'] == \'Debian\' %}',
    'install_nginx:',
    '  pkg.installed:',
    '    - name: nginx',
    '    - version: {{ pillar.get(\'nginx:version\', \'latest\') }}',
    '',
    'nginx_service:',
    '  service.running:',
    '    - name: nginx',
    '    - enable: true',
    '{% else %}',
    'install_httpd:',
    '  pkg.installed:',
    '    - name: httpd',
    '{% endif %}',
  ]);

  assert.ok(lineHasScope(lines[0], 'comment.line.number-sign.yaml'));
  assert.ok(lineHasScope(lines[1], 'comment.line.number-sign.yaml'));
  assert.ok(lineHasScope(lines[2], 'comment.line.number-sign.yaml'));
  assert.equal(lineHasScope(lines[1], 'source.jinja'), false);
  assert.equal(lineHasScope(lines[2], 'source.jinja'), false);

  assert.ok(lineHasScope(lines[4], 'jinja'));
  assert.equal(lineHasScope(lines[5], 'source.jinja'), false);
  assert.equal(lineHasScope(lines[6], 'source.jinja'), false);
  assert.ok(lines[5].length > 0);
  assert.ok(lines[6].length > 0);
  assert.ok(lineHasScope(lines[8], 'jinja'));

  assert.equal(lineHasScope(lines[10], 'source.jinja'), false);
  assert.equal(lineHasScope(lines[11], 'source.jinja'), false);
  assert.ok(lines[10].length > 0);
  assert.ok(lines[11].length > 0);

  assert.ok(lineHasScope(lines[14], 'jinja'));
  assert.equal(lineHasScope(lines[15], 'source.jinja'), false);
  assert.equal(lineHasScope(lines[16], 'source.jinja'), false);
  assert.ok(lines[15].length > 0);
  assert.ok(lines[16].length > 0);
  assert.ok(lineHasScope(lines[18], 'jinja'));
});

test('many leading YAML comments with Jinja-like text do not destabilize later blocks', async () => {
  const lines = await tokenize('text.yaml.jinja', [
    '# first comment',
    '# {{ grains.id }}',
    '# {% if grains[\'os_family\'] == \'Debian\' %}',
    '# {{ pillar.get(\'role\', \'web\') }}',
    '# {% set value = salt[\'cmd.run\'](\'id\') %}',
    '# final comment',
    '',
    '{% if grains[\'os_family\'] == \'Debian\' %}',
    'install_nginx:',
    '  pkg.installed:',
    '    - name: nginx',
    '{% else %}',
    'install_httpd:',
    '  pkg.installed:',
    '    - name: httpd',
    '{% endif %}',
  ]);

  for (const index of [0, 1, 2, 3, 4, 5]) {
    assert.ok(lineHasScope(lines[index], 'comment.line.number-sign.yaml'));
    assert.equal(lineHasScope(lines[index], 'source.jinja'), false);
  }

  assert.ok(lineHasScope(lines[7], 'jinja'));
  assert.equal(lineHasScope(lines[8], 'source.jinja'), false);
  assert.equal(lineHasScope(lines[9], 'source.jinja'), false);
  assert.ok(lineHasScope(lines[11], 'jinja'));
  assert.equal(lineHasScope(lines[12], 'source.jinja'), false);
  assert.equal(lineHasScope(lines[13], 'source.jinja'), false);
  assert.ok(lineHasScope(lines[15], 'jinja'));
});

test('multi-line Jinja comment and raw blocks stay isolated inside SLS files', async () => {
  const lines = await tokenize('text.yaml.jinja', [
    '{#',
    '  {{ should_not_be_active }}',
    '#}',
    'after_comment:',
    '  test.nop:',
    '    - name: still yaml',
    '{% raw %}',
    '  {{ also_not_active }}',
    '{% endraw %}',
    'after_raw:',
    '  test.nop:',
    '    - name: {{ actual_value }}',
  ]);

  assert.ok(lineHasScope(lines[0], 'comment.block.jinja'));
  assert.ok(lineHasScope(lines[1], 'comment.block.jinja'));
  assert.equal(lineHasScope(lines[1], 'meta.scope.jinja.variable'), false);
  assert.equal(lineHasScope(lines[3], 'source.jinja'), false);
  assert.ok(lines[3].length > 0);
  assert.ok(lineHasScope(lines[6], 'comment.block.jinja.raw'));
  assert.ok(lineHasScope(lines[7], 'comment.block.jinja.raw'));
  assert.equal(lineHasScope(lines[7], 'meta.scope.jinja.variable'), false);
  assert.equal(lineHasScope(lines[9], 'source.jinja'), false);
  assert.ok(lines[9].length > 0);
  assert.ok(lineHasScope(lines[11], 'jinja'));
});

test('Jinja raw and comment regions suppress inner active Jinja tokenization', async () => {
  const lines = await tokenize('source.jinja', [
    '{% raw %}',
    '{{ should_not_be_active }}',
    '{% endraw %}',
    '{# {{ still_not_active }} #}',
    '{{ actual_value }}',
  ]);

  assert.ok(lineHasScope(lines[0], 'comment.block.jinja.raw'));
  assert.ok(lineHasScope(lines[1], 'comment.block.jinja.raw'));
  assert.equal(lineHasScope(lines[1], 'meta.scope.jinja.variable'), false);
  assert.ok(lineHasScope(lines[3], 'comment.block.jinja'));
  assert.equal(lineHasScope(lines[3], 'meta.scope.jinja.variable'), false);
  assert.ok(lineHasScope(lines[4], 'meta.scope.jinja.variable'));
});

test('whole-file shebang renderer modes switch the file to the embedded language', async () => {
  const pythonLines = await tokenize('text.yaml.jinja', ['#!py', 'value = 1']);
  const bashLines = await tokenize('text.yaml.jinja', ['#!bash', 'echo "$HOME"']);
  const phpLines = await tokenize('text.yaml.jinja', ['#!php', '<?php echo 1;']);

  assert.ok(lineHasScope(pythonLines[1], 'source.python'));
  assert.equal(lineHasScope(pythonLines[1], 'source.yaml'), false);
  assert.ok(lineHasScope(bashLines[1], 'source.shell'));
  assert.equal(lineHasScope(bashLines[1], 'source.yaml'), false);
  assert.ok(lineHasScope(phpLines[1], 'source.php'));
  assert.equal(lineHasScope(phpLines[1], 'source.yaml'), false);
});

function findExistingPath(paths) {
  return paths.find((candidate) => fs.existsSync(candidate));
}

function buildScopeFileMap() {
  const scopeToFile = new Map();
  const roots = [path.join(repoRoot, 'syntaxes')];
  if (fs.existsSync(vsCodeExtensions)) {
    for (const entry of fs.readdirSync(vsCodeExtensions, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue;
      }
      const syntaxesDir = path.join(vsCodeExtensions, entry.name, 'syntaxes');
      if (fs.existsSync(syntaxesDir)) {
        roots.push(syntaxesDir);
      }
    }
  }

  for (const root of roots) {
    for (const filePath of walkJsonFiles(root)) {
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (data.scopeName) {
          scopeToFile.set(data.scopeName, filePath);
        }
      } catch {}
    }
  }

  return scopeToFile;
}

function walkJsonFiles(directory, files = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walkJsonFiles(fullPath, files);
    } else if (entry.isFile() && fullPath.endsWith('.json')) {
      files.push(fullPath);
    }
  }
  return files;
}

async function tokenize(scopeName, lines) {
  const grammar = await registry.loadGrammar(scopeName);
  assert.ok(grammar, `Grammar ${scopeName} should load`);
  const tokenizedLines = [];
  let ruleStack = textmate.INITIAL;
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, ruleStack);
    tokenizedLines.push(result.tokens);
    ruleStack = result.ruleStack;
  }
  return tokenizedLines;
}

function lineHasScope(tokens, scopeFragment) {
  return tokens.some((token) => token.scopes.some((scope) => scope.includes(scopeFragment)));
}

function tokenTextHasScope(line, tokens, text, scopeFragment) {
  return tokens.some((token) => line.slice(token.startIndex, token.endIndex) === text && token.scopes.some((scope) => scope.includes(scopeFragment)));
}