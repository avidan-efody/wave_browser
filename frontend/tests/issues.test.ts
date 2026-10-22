import test from 'node:test';
import assert from 'node:assert/strict';
import { newId } from '../src/utils/id.ts';
import { chooseCompanionRc } from '../src/rc/companionRc.ts';
import { scopeMatchesKinds } from '../src/components/HierarchyPanel/hierarchyKinds.ts';

const scope = (name: string, scope_type: 'module' | 'package' | 'interface' | 'unknown') => ({
  path: name,
  name,
  scope_type,
  has_children: false,
  has_signals: false,
});

test('newId works when randomUUID is missing', () => {
  const original = crypto.randomUUID;
  Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true });
  try {
    const id = newId();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  } finally {
    Object.defineProperty(crypto, 'randomUUID', { value: original, configurable: true });
  }
});

test('top-level packages stay hidden when only modules are selected', () => {
  const kinds = { modules: true, interfaces: false, packages: false };
  assert.equal(scopeMatchesKinds(scope('tb_bus', 'module'), kinds), true);
  assert.equal(scopeMatchesKinds(scope('bus_pkg', 'package'), kinds), false);
  assert.equal(scopeMatchesKinds(scope('uvm_pkg', 'module'), kinds), false);
  assert.equal(scopeMatchesKinds(scope('uvm_pkg', 'unknown'), kinds), false);
  const packagesOn = { ...kinds, packages: true };
  assert.equal(scopeMatchesKinds(scope('uvm_pkg', 'module'), packagesOn), true);
});

test('companion rc prefers the waveform stem and reports an ambiguous directory', () => {
  const entries = [
    { name: 'notes.rc', path: '/sim/notes.rc', is_dir: false },
    { name: 'waves.rc', path: '/sim/waves.rc', is_dir: false },
    { name: 'other.txt', path: '/sim/other.txt', is_dir: false },
  ];
  assert.deepEqual(chooseCompanionRc('/sim/waves.fsdb', entries), { path: '/sim/waves.rc', error: null });
  assert.equal(chooseCompanionRc('/sim/chip.fsdb', [entries[0]]).path, '/sim/notes.rc');
  const ambiguous = chooseCompanionRc('/sim/chip.fsdb', entries);
  assert.equal(ambiguous.path, null);
  assert.match(ambiguous.error || '', /notes\.rc/);
  assert.deepEqual(chooseCompanionRc('/sim/chip.fsdb', []), { path: null, error: null });
});
