import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const errors = [];
const warnings = [];

function readJson(relativePath) {
  const absolutePath = path.join(rootDir, relativePath);
  try {
    return JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  } catch (error) {
    errors.push(`${relativePath}: ${error.message}`);
    return null;
  }
}

function ensureFile(relativePath, label) {
  const absolutePath = path.join(rootDir, relativePath);
  if (!fs.existsSync(absolutePath)) {
    errors.push(`${label} is missing: ${relativePath}`);
    return false;
  }
  return true;
}

function listJsonFiles(relativeDir) {
  const directory = path.join(rootDir, relativeDir);
  return fs
    .readdirSync(directory)
    .filter((fileName) => fileName.endsWith('.json'))
    .map((fileName) => path.posix.join(relativeDir, fileName))
    .sort();
}

function ensurePackaged(fileEntry, label) {
	const files = packageJson.files ?? [];
	if (!files.includes(fileEntry)) {
		errors.push(`${label} must be included in package.json files: ${fileEntry}`);
	}
}

const packageJson = readJson('package.json');

if (!packageJson) {
  process.exit(1);
}

ensureFile('tests/grammarTokenization.test.mjs', 'Grammar regression test');

const contributes = packageJson.contributes ?? {};
const languages = contributes.languages ?? [];
const grammars = contributes.grammars ?? [];
const snippets = contributes.snippets ?? [];
const activationEvents = packageJson.activationEvents ?? [];
const slsGrammar = readJson('syntaxes/sls.json');

if (packageJson.main) {
	const mainPath = packageJson.main.replace(/^\.\//, '');
	ensureFile(mainPath, 'Extension entry point');
	ensurePackaged(mainPath, 'Extension entry point');
	if (!activationEvents.includes('onLanguage:sls')) {
		errors.push('Runtime extension must activate on the sls language');
	}
	ensurePackaged('lib/**', 'Hover helper library');
	ensurePackaged('generate_snippets.py', 'Shared Salt Python helper');
	ensurePackaged('scripts/export_state_hover_docs.py', 'Salt hover doc export helper');
}

const languageIds = new Set();
for (const language of languages) {
  if (!language?.id) {
    errors.push('A language contribution is missing its id');
    continue;
  }
  if (languageIds.has(language.id)) {
    errors.push(`Duplicate language id: ${language.id}`);
  }
  languageIds.add(language.id);
}

for (const language of languages) {
  if (language.configuration) {
    ensureFile(language.configuration.replace(/^\.\//, ''), `Language configuration for ${language.id}`);
  }
}

for (const grammar of grammars) {
	  if (grammar.language) {
	    if (!languageIds.has(grammar.language)) {
	      errors.push(`Grammar references unknown language id: ${grammar.language}`);
	    }
	  } else if (!Array.isArray(grammar.injectTo) || grammar.injectTo.length === 0) {
	    errors.push(`Injection grammar must declare injectTo: ${grammar.path}`);
	  }
  const grammarPath = grammar.path.replace(/^\.\//, '');
  if (ensureFile(grammarPath, `Grammar for ${grammar.language}`)) {
    readJson(grammarPath);
  }
}

for (const languageId of ['sls', 'saltcheck']) {
  const grammar = grammars.find((entry) => entry.language === languageId);
  if (grammar?.embeddedLanguages?.['source.jinja'] !== 'jinja') {
    errors.push(`Grammar contribution for ${languageId} must map embedded source.jinja to the jinja language id`);
  }
  if (grammar?.embeddedLanguages?.['source.python'] !== 'python') {
    errors.push(`Grammar contribution for ${languageId} must map embedded source.python to the python language id`);
  }
  if (grammar?.embeddedLanguages?.['source.php'] !== 'php') {
    errors.push(`Grammar contribution for ${languageId} must map embedded source.php to the php language id`);
  }
  if (grammar?.embeddedLanguages?.['source.shell'] !== 'shellscript') {
    errors.push(`Grammar contribution for ${languageId} must map embedded source.shell to the shellscript language id`);
  }
}

const snippetPaths = new Map();
for (const snippet of snippets) {
  if (!languageIds.has(snippet.language)) {
    errors.push(`Snippet contribution ${snippet.path} references unknown language id: ${snippet.language}`);
  }
  const snippetPath = snippet.path.replace(/^\.\//, '');
  if (snippetPaths.has(snippetPath)) {
    errors.push(`Snippet file referenced multiple times: ${snippetPath}`);
  }
  snippetPaths.set(snippetPath, snippet.language);
  if (ensureFile(snippetPath, `Snippet file for ${snippet.language}`)) {
    readJson(snippetPath);
  }
}

const snippetFilesOnDisk = listJsonFiles('snippets');
for (const snippetFile of snippetFilesOnDisk) {
  if (!snippetPaths.has(snippetFile)) {
    warnings.push(`Snippet file exists but is not contributed: ${snippetFile}`);
  }
}

const slsOwner = languages.find((language) => language.extensions?.includes('.sls'))?.id;
const tstOwner = languages.find((language) => language.extensions?.includes('.tst'))?.id;
if (slsOwner !== 'sls') {
  errors.push(`.sls should be owned by language id "sls", found: ${slsOwner ?? 'none'}`);
}
if (tstOwner !== 'saltcheck') {
  errors.push(`.tst should be owned by language id "saltcheck", found: ${tstOwner ?? 'none'}`);
}
if (snippetPaths.get('snippets/saltcheck.json') !== 'saltcheck') {
  errors.push('snippets/saltcheck.json must be contributed to the "saltcheck" language id');
}

const shebangPythonPattern = slsGrammar?.patterns?.find((pattern) => pattern.begin === '\\A(#!py\\b.*$)');
const shebangPhpPattern = slsGrammar?.patterns?.find((pattern) => pattern.begin === '\\A(#!php\\b.*$)');
const shebangBashPattern = slsGrammar?.patterns?.find((pattern) => pattern.begin === '\\A(#!bash\\b.*$)');
const slsRootCommentPattern = slsGrammar?.patterns?.find((pattern) => pattern.match === '^\\s*#.*$');
const slsRootJinjaLinePattern = slsGrammar?.patterns?.find((pattern) => pattern.begin === '^\\s*(?=\\{[%#])');
const includesYaml = slsGrammar?.patterns?.some((pattern) => pattern.include === 'source.yaml');
const includesJinjaDirectly = slsGrammar?.patterns?.some((pattern) => pattern.include === 'source.jinja');
const slsInjectionContribution = grammars.find((grammar) => grammar.path === './syntaxes/sls.injection.json');
const slsInjectionGrammar = readJson('syntaxes/sls.injection.json');
const slsInjectionCommentPattern = slsInjectionGrammar?.patterns?.find((pattern) => pattern.match === '^\\s*#.*$');
const slsInjectionJinjaLinePattern = slsInjectionGrammar?.patterns?.find((pattern) => pattern.begin === '^\\s*(?=\\{[%#])');
const slsInjectionIncludesJinja = slsInjectionGrammar?.patterns?.some((pattern) => pattern.include === 'source.jinja');

if (slsGrammar?.firstLineMatch && slsGrammar.firstLineMatch !== '^#!py\\b') {
	errors.push('syntaxes/sls.json firstLineMatch must only special-case #!py at the start of the file');
}

if (!includesYaml) {
	errors.push('syntaxes/sls.json must include source.yaml');
}

if (!slsRootCommentPattern || slsRootCommentPattern.name !== 'comment.line.number-sign.yaml') {
	errors.push('syntaxes/sls.json must explicitly protect root YAML comment lines before source.yaml');
}

if (includesJinjaDirectly) {
	errors.push('syntaxes/sls.json must not include source.jinja directly; use the SLS injection grammar instead');
}

if (!slsRootJinjaLinePattern) {
	errors.push('syntaxes/sls.json must protect full-line Jinja tags/comments before source.yaml');
	} else {
	if (slsRootJinjaLinePattern.end !== '$') {
		errors.push('The full-line Jinja rule in syntaxes/sls.json must extend to end of line');
	}
	const includesInjectedJinja = slsRootJinjaLinePattern.patterns?.some((pattern) => pattern.include === 'source.jinja');
	if (!includesInjectedJinja) {
		errors.push('The full-line Jinja rule in syntaxes/sls.json must include source.jinja');
	}
}

if (!slsInjectionContribution) {
	errors.push('package.json must contribute ./syntaxes/sls.injection.json as an injection grammar');
} else {
	if (slsInjectionContribution.scopeName !== 'text.yaml.jinja.injection') {
		errors.push('The SLS injection grammar must use the scopeName text.yaml.jinja.injection');
	}
	if (!slsInjectionContribution.injectTo?.includes('text.yaml.jinja')) {
		errors.push('The SLS injection grammar must inject into text.yaml.jinja');
	}
}

if (slsInjectionGrammar?.injectionSelector !== 'L:source.yaml -comment') {
	errors.push('syntaxes/sls.injection.json must inject into source.yaml while excluding comment scopes');
}

if (!slsInjectionCommentPattern || slsInjectionCommentPattern.name !== 'comment.line.number-sign.yaml') {
	errors.push('syntaxes/sls.injection.json must explicitly protect YAML comment lines before inline Jinja injection');
}

const testScript = packageJson.scripts?.test ?? '';
const nodeTestScript = packageJson.scripts?.['test:node'] ?? '';
if (!testScript.includes('npm run validate') || !testScript.includes('npm run test:node') || !nodeTestScript.includes('node --test')) {
	errors.push('package.json test scripts must run both structural validation and Node-based regression tests');
}

if (!slsInjectionJinjaLinePattern) {
	errors.push('syntaxes/sls.injection.json must protect full-line Jinja tags/comments inside YAML contexts');
} else {
	if (slsInjectionJinjaLinePattern.end !== '$') {
		errors.push('The full-line Jinja rule in syntaxes/sls.injection.json must extend to end of line');
	}
	const injectionLineIncludesJinja = slsInjectionJinjaLinePattern.patterns?.some((pattern) => pattern.include === 'source.jinja');
	if (!injectionLineIncludesJinja) {
		errors.push('The full-line Jinja rule in syntaxes/sls.injection.json must include source.jinja');
	}
}

if (!slsInjectionIncludesJinja) {
	errors.push('syntaxes/sls.injection.json must include source.jinja for inline Jinja expressions in YAML');
}

if (!shebangPythonPattern) {
  errors.push('syntaxes/sls.json must detect #!py at the start of the file');
} else {
  if (shebangPythonPattern.end !== '\\z') {
    errors.push('The #!py Python renderer rule in syntaxes/sls.json must extend to the end of the file');
  }
  const includesPython = shebangPythonPattern.patterns?.some((pattern) => pattern.include === 'source.python');
  if (!includesPython) {
    errors.push('The #!py Python renderer rule in syntaxes/sls.json must include source.python');
  }
}

if (!shebangPhpPattern) {
  errors.push('syntaxes/sls.json must detect #!php at the start of the file');
} else {
  if (shebangPhpPattern.end !== '\\z') {
    errors.push('The #!php PHP renderer rule in syntaxes/sls.json must extend to the end of the file');
  }
  if (shebangPhpPattern.contentName !== 'source.php') {
    errors.push('The #!php PHP renderer rule in syntaxes/sls.json must set contentName to source.php');
  }
  const includesPhp = shebangPhpPattern.patterns?.some((pattern) => pattern.include === 'source.php');
  if (!includesPhp) {
    errors.push('The #!php PHP renderer rule in syntaxes/sls.json must include source.php');
  }
}

if (!shebangBashPattern) {
  errors.push('syntaxes/sls.json must detect #!bash at the start of the file');
} else {
  if (shebangBashPattern.end !== '\\z') {
    errors.push('The #!bash Bash renderer rule in syntaxes/sls.json must extend to the end of the file');
  }
  if (shebangBashPattern.contentName !== 'source.shell') {
    errors.push('The #!bash Bash renderer rule in syntaxes/sls.json must set contentName to source.shell');
  }
  const includesShell = shebangBashPattern.patterns?.some((pattern) => pattern.include === 'source.shell');
  if (!includesShell) {
    errors.push('The #!bash Bash renderer rule in syntaxes/sls.json must include source.shell');
  }
}

readJson('jinja.configuration.json');

if (errors.length > 0) {
  console.error('Extension validation failed:\n');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  if (warnings.length > 0) {
    console.error('\nWarnings:');
    for (const warning of warnings) {
      console.error(`- ${warning}`);
    }
  }
  process.exit(1);
}

console.log('Extension validation succeeded.');
console.log(`Languages: ${languages.length}`);
console.log(`Grammars: ${grammars.length}`);
console.log(`Snippet contributions: ${snippets.length}`);
console.log(`Snippet files on disk: ${snippetFilesOnDisk.length}`);

if (warnings.length > 0) {
  console.log('\nWarnings:');
  for (const warning of warnings) {
    console.log(`- ${warning}`);
  }
}