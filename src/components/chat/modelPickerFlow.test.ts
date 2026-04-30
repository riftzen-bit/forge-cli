import { describe, expect, test } from 'bun:test';
import { pickerAfterModelSelect } from './modelPickerFlow.js';

describe('pickerAfterModelSelect', () => {
  test('routes ChatGPT/Codex models to thinking picker', () => {
    expect(pickerAfterModelSelect('gpt-5.5')).toBe('thinking');
  });

  test('does not route Claude models to thinking picker', () => {
    expect(pickerAfterModelSelect('claude-opus-4-7')).toBe('none');
  });
});