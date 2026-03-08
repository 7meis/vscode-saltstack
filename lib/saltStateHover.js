const SALT_STATE_IDENTIFIER_PATTERN = /[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*/g;

function findSaltStateIdentifier(lineText, character) {
  if (typeof lineText !== 'string') {
    return null;
  }

  for (const match of lineText.matchAll(SALT_STATE_IDENTIFIER_PATTERN)) {
    const symbol = match[0];
    const start = match.index ?? 0;
    const end = start + symbol.length;
    if (character >= start && character <= end) {
      return { symbol, start, end };
    }
  }

  return null;
}

function createSignature(symbol, args = []) {
  return Array.isArray(args) && args.length > 0
    ? `${symbol}(${args.join(', ')})`
    : symbol;
}

function compactDocstring(docstring) {
  if (!docstring) {
    return '';
  }

  return String(docstring)
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildStateDocUrl(symbol, docsVersion = 'latest') {
  const [moduleName] = String(symbol).split('.');
  return `https://docs.saltproject.io/en/${docsVersion}/ref/states/all/salt.states.${moduleName}.html`;
}

module.exports = {
  SALT_STATE_IDENTIFIER_PATTERN,
  buildStateDocUrl,
  compactDocstring,
  createSignature,
  findSaltStateIdentifier,
};