import { describe, expect, test } from 'bun:test';
import {
  PERMISSION_MODES,
  DEFAULT_PERMISSION_MODE,
  nextPermissionMode,
  type PermissionMode,
} from './settings.js';

describe('PERMISSION_MODES', () => {
  test('declares the four expected modes', () => {
    expect(PERMISSION_MODES).toEqual(['default', 'autoAccept', 'plan', 'yolo']);
  });

  test('default is "default"', () => {
    expect(DEFAULT_PERMISSION_MODE).toBe('default');
  });
});

describe('nextPermissionMode', () => {
  test('cycles default -> autoAccept -> plan -> yolo -> default', () => {
    let m: PermissionMode = 'default';
    m = nextPermissionMode(m); expect(m).toBe('autoAccept');
    m = nextPermissionMode(m); expect(m).toBe('plan');
    m = nextPermissionMode(m); expect(m).toBe('yolo');
    m = nextPermissionMode(m); expect(m).toBe('default');
  });

  test('full cycle is exactly PERMISSION_MODES.length steps', () => {
    let m: PermissionMode = 'default';
    for (let i = 0; i < PERMISSION_MODES.length; i++) m = nextPermissionMode(m);
    expect(m).toBe('default');
  });
});
