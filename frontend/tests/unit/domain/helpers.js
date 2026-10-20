import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { expect } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
const fixturesDir = join(repoRoot, 'shared', 'fixtures');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf-8'));

// The backend file is the single source of catalog data; the browser receives it via the API.
export const loadCatalog = () => {
  const { materials, colors, finishes, handleStyles, handleFinishes } = readJson(join(repoRoot, 'backend', 'app', 'domain', 'catalog.json'));
  return { materials, colors, finishes, handleStyles, handleFinishes };
};

export const loadDesign = (name) => readJson(join(fixturesDir, 'designs', `${name}.json`));

export const loadOpCases = () =>
  readdirSync(join(fixturesDir, 'ops'))
    .filter((file) => file.endsWith('.json'))
    .sort()
    .flatMap((file) => readJson(join(fixturesDir, 'ops', file)).map((testCase) => ({ ...testCase, file })));

// `expected` must be a structural subset of `actual`; arrays must match length.
export function expectSubset(actual, expected, path = '$') {
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual), `${path}: expected array`).toBe(true);
    expect(actual.length, `${path}: length`).toBe(expected.length);
    expected.forEach((value, index) => expectSubset(actual[index], value, `${path}[${index}]`));
  } else if (expected !== null && typeof expected === 'object') {
    expect(actual !== null && typeof actual === 'object', `${path}: expected object`).toBe(true);
    for (const [key, value] of Object.entries(expected)) {
      expect(key in actual, `${path}.${key}: missing`).toBe(true);
      expectSubset(actual[key], value, `${path}.${key}`);
    }
  } else {
    expect(actual, path).toEqual(expected);
  }
}
