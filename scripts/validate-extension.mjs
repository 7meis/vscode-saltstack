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
  if (!languageIds.has(grammar.language)) {
    errors.push(`Grammar references unknown language id: ${grammar.language}`);
  }
  const grammarPath = grammar.path.replace(/^\.\//, '');
  if (ensureFile(grammarPath, `Grammar for ${grammar.language}`)) {
    readJson(grammarPath);
  }
}

for (const languageId of ['sls', 'saltcheck']) {
  const grammar = grammars.find((entry) => entry.language === languageId);
  if (grammar?.embeddedLanguages?.['source.python'] !== 'python') {
    errors.push(`Grammar contribution for ${languageId} must map embedded source.python to the python language id`);
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