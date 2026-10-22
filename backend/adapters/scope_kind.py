"""Classify hierarchy scopes that simulators label loosely."""

import re
from typing import Optional

from .base import ScopeType

# SystemVerilog packages are conventionally named uvm_pkg, bus_pkg, ...
_PACKAGE_NAME = re.compile(r"(?:_pkg|_package)$", re.IGNORECASE)

# Attribute names used by different Verdi / NPI builds for package scopes.
PACKAGE_SCOPE_ATTRS = (
    "ScopeSvPackage",
    "npiFsdbScopeSvPackage",
    "ScopeVhPackage",
    "ScopeVhdlPackage",
    "npiFsdbScopeVhdlPackage",
    "ScopeVhPackageBody",
    "npiFsdbScopeVhdlPackageBody",
)


def looks_like_package(name: Optional[str]) -> bool:
    if not name:
        return False
    return _PACKAGE_NAME.search(name) is not None


def refine_scope_type(scope_type: ScopeType, name: str, def_name: Optional[str] = None) -> ScopeType:
    """Treat *_pkg scopes as packages when the database calls them a module or nothing.

    FSDB top scopes such as uvm_pkg often come back as a plain module or an
    unmapped scope type. The hierarchy filter then keeps them visible while
    modules are the only kind selected.
    """
    if scope_type not in (ScopeType.UNKNOWN, ScopeType.MODULE):
        return scope_type
    if looks_like_package(name) or looks_like_package(def_name):
        return ScopeType.PACKAGE
    return scope_type


def package_type_values(wave_module) -> list:
    values = []
    for attr in PACKAGE_SCOPE_ATTRS:
        value = getattr(wave_module, attr, None)
        if isinstance(value, int) and value not in values:
            values.append(value)
    return values
