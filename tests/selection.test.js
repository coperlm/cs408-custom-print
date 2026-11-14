import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const parserSource = source.slice(source.indexOf('function parseSelection'), source.indexOf('\nfunction encodeSelection'));
const context = {
  YEARS: Array.from({ length: 18 }, (_, index) => 2009 + index),
};
const parseSelection = vm.runInNewContext(`(${parserSource.replace('function parseSelection', 'function')})`, context);
const codecSource = source.slice(source.indexOf('function encodeSelection'), source.indexOf('\nfunction selectionToInput'));
const { encodeSelection, decodeSelection } = vm.runInNewContext(`(() => { ${codecSource}; return { encodeSelection, decodeSelection }; })()`, context);

test('parses one year per line with comma, spaces, and stable de-duplication', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseSelection('2009 1,2 3,2\n2022 11,40\n2026 1'))),
    [
      { year: 2009, number: 1 }, { year: 2009, number: 2 }, { year: 2009, number: 3 },
      { year: 2022, number: 11 }, { year: 2022, number: 40 }, { year: 2026, number: 1 },
    ],
  );
});

test('rejects invalid years, empty year rows, ranges, and non-choice numbers', () => {
  for (const value of ['2008 1', '2022', '2022 0', '2022 41', '2022 1-3', '2022 all']) {
    assert.throws(() => parseSelection(value));
  }
});

test('packs the full 18-year choice selection into a short reversible URL token', () => {
  const all = Array.from({ length: 18 * 40 }, (_, index) => ({
    year: 2009 + Math.floor(index / 40),
    number: (index % 40) + 1,
  }));
  const packed = encodeSelection(all);
  assert.equal(packed.length, 18 * 15 + 17);
  assert.deepEqual(JSON.parse(JSON.stringify(decodeSelection(packed))), all);
});
