import { describe, expect, test } from 'bun:test';
import { SLASH_COMMANDS, filterCommands, expand } from './registry.js';

describe('filterCommands', () => {
  test('empty string returns nothing', () => {
    expect(filterCommands('')).toEqual([]);
  });

  test('lone slash returns all', () => {
    expect(filterCommands('/')).toEqual(SLASH_COMMANDS);
  });

  test('prefix filters case-insensitively', () => {
    const names = filterCommands('/mo').map((c) => c.name);
    expect(names).toEqual(['model']);
  });

  test('unknown prefix returns empty', () => {
    expect(filterCommands('/zzz')).toEqual([]);
  });

  test('ignores trailing argument', () => {
    const names = filterCommands('/model foo').map((c) => c.name);
    expect(names).toEqual(['model']);
  });

  test('non-slash input returns empty', () => {
    expect(filterCommands('hello')).toEqual([]);
  });
});

describe('expand', () => {
  test('no-arg command expands to /name', () => {
    expect(expand({ name: 'help', hint: 'x' })).toBe('/help');
  });

  test('takesArg command expands with trailing space', () => {
    expect(expand({ name: 'model', hint: 'x', takesArg: true })).toBe('/model ');
  });
});
