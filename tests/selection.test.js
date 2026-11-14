import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../app.js', import.meta.url), 'utf8');
const parserSource = source.slice(source.indexOf('function parseSelection'), source.indexOf('\nasync function loadYear'));
const parseSelection = vm.runInNewContext(`(${parserSource.replace('function parseSelection', 'function')})`, {
  YEARS: Array.from({ length: 18 }, (_, index) => 2009 + index),
});

test('parses multiple years, ranges, all, and removes duplicates preserving order', () => {
  assert.deepEqual(
    JSON.parse(JSON.stringify(parseSelection('2009:1-3,2;2022:11,41-42;2026:all'))),
    [
      { year: 2009, number: 1 }, { year: 2009, number: 2 }, { year: 2009, number: 3 },
      { year: 2022, number: 11 }, { year: 2022, number: 41 }, { year: 2022, number: 42 },
      ...Array.from({ length: 47 }, (_, index) => ({ year: 2026, number: index + 1 })),
    ],
  );
});

test('rejects unsupported years, invalid endpoints, and empty clauses', () => {
  for (const value of ['2008:1', '2022:0', '2022:48', '2022:4-2', '2022:1;', ';2022:1']) {
    assert.throws(() => parseSelection(value));
  }
});
