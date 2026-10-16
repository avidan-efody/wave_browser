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

/** Modules, interfaces, and packages are opt-in. Other scopes stay visible. */
export function scopeMatchesKinds(scope: ScopeInfo, kinds: HierarchyKinds): boolean {
  if (scope.scope_type === 'interface') return kinds.interfaces;
  if (scope.scope_type === 'package') return kinds.packages;
  if (scope.scope_type === 'module') return kinds.modules;
  return true;
}
