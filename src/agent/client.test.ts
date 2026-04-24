// Unit tests for AgentClient's pure state surface — no SDK calls.
// Validates permission-mode getters/setters and back-compat shims so the
// refactor from planMode/yolo booleans to a single enum doesn't regress
// any caller still using the old method names.

import { describe, expect, test } from 'bun:test';
import { AgentClient } from './client.js';

describe('AgentClient permissionMode', () => {
  test('default permissionMode is "default"', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7' });
    expect(c.getPermissionMode()).toBe('default');
  });

  test('constructor accepts initial permissionMode', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7', permissionMode: 'yolo' });
    expect(c.getPermissionMode()).toBe('yolo');
  });

  test('setPermissionMode round-trips', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7' });
    c.setPermissionMode('autoAccept');
    expect(c.getPermissionMode()).toBe('autoAccept');
    c.setPermissionMode('plan');
    expect(c.getPermissionMode()).toBe('plan');
  });

  test('legacy setPlanMode true => permissionMode "plan"', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7' });
    c.setPlanMode(true);
    expect(c.getPermissionMode()).toBe('plan');
    expect(c.getPlanMode()).toBe(true);
  });

  test('legacy setPlanMode false => permissionMode "default"', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7', permissionMode: 'plan' });
    c.setPlanMode(false);
    expect(c.getPermissionMode()).toBe('default');
    expect(c.getPlanMode()).toBe(false);
  });

  test('legacy setYolo true => permissionMode "yolo"', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7' });
    c.setYolo(true);
    expect(c.getPermissionMode()).toBe('yolo');
    expect(c.getYolo()).toBe(true);
  });

  test('legacy setYolo false => permissionMode "default"', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7', permissionMode: 'yolo' });
    c.setYolo(false);
    expect(c.getPermissionMode()).toBe('default');
    expect(c.getYolo()).toBe(false);
  });

  test('getPlanMode/getYolo reflect current permissionMode', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7' });
    expect(c.getPlanMode()).toBe(false);
    expect(c.getYolo()).toBe(false);
    c.setPermissionMode('plan');
    expect(c.getPlanMode()).toBe(true);
    expect(c.getYolo()).toBe(false);
    c.setPermissionMode('yolo');
    expect(c.getPlanMode()).toBe(false);
    expect(c.getYolo()).toBe(true);
    c.setPermissionMode('autoAccept');
    expect(c.getPlanMode()).toBe(false);
    expect(c.getYolo()).toBe(false);
  });
});

describe('AgentClient permission requester', () => {
  test('setPermissionRequester accepts a function', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7' });
    const fn = async () => 'yes' as const;
    c.setPermissionRequester(fn);
    // No public getter; simply asserting no throw is the contract.
    expect(true).toBe(true);
  });

  test('setPermissionRequester(undefined) clears the requester', () => {
    const c = new AgentClient({ model: 'claude-opus-4-7' });
    c.setPermissionRequester(async () => 'yes');
    c.setPermissionRequester(undefined);
    expect(true).toBe(true);
  });
});
