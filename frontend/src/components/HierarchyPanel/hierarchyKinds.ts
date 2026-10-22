import type { ScopeInfo } from '../../api/types';

export interface HierarchyKinds {
  modules: boolean;
  interfaces: boolean;
  packages: boolean;
}

export const DEFAULT_HIERARCHY_KINDS: HierarchyKinds = {
  modules: true,
  interfaces: false,
  packages: false,
};

const PACKAGE_NAME = /(?:_pkg|_package)$/i;

/** uvm_pkg and bus_pkg are packages even when the database calls them a module. */
export function looksLikePackage(scope: Pick<ScopeInfo, 'name' | 'def_name'>): boolean {
  return [scope.name, scope.def_name].some((name) => !!name && PACKAGE_NAME.test(name));
}

/**
 * Modules, interfaces, and packages are opt-in. Other scopes stay visible.
 * A top-level package is often unlabeled (or labeled as a module) in an FSDB,
 * so the name is checked too. Otherwise uvm_pkg stays on screen when only
 * modules are selected.
 */
export function scopeMatchesKinds(scope: ScopeInfo, kinds: HierarchyKinds): boolean {
  const unlabeled = !scope.scope_type || scope.scope_type === 'unknown' || scope.scope_type === 'module';
  const type = unlabeled && looksLikePackage(scope) ? 'package' : scope.scope_type;
  if (type === 'interface') return kinds.interfaces;
  if (type === 'package') return kinds.packages;
  if (type === 'module') return kinds.modules;
  return true;
}
