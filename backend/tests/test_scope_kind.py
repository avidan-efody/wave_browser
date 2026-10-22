"""Package scopes stay packages even when a database mislabels them."""

from adapters.base import ScopeType
from adapters.scope_kind import package_type_values, refine_scope_type


def test_pkg_suffix_overrides_module_and_unknown():
    assert refine_scope_type(ScopeType.MODULE, "uvm_pkg") == ScopeType.PACKAGE
    assert refine_scope_type(ScopeType.UNKNOWN, "tb", "bus_pkg") == ScopeType.PACKAGE
    assert refine_scope_type(ScopeType.MODULE, "custom_package") == ScopeType.PACKAGE


def test_real_modules_and_interfaces_stay_put():
    assert refine_scope_type(ScopeType.MODULE, "tb_bus") == ScopeType.MODULE
    assert refine_scope_type(ScopeType.INTERFACE, "bus_pkg") == ScopeType.INTERFACE
    assert refine_scope_type(ScopeType.PACKAGE, "uvm_pkg") == ScopeType.PACKAGE


def test_package_type_values_reads_known_attribute_names():
    class Wave:
        ScopeSvPackage = 19
        npiFsdbScopeSvPackage = 19
        ScopeVhdlPackage = 28
        ScopeName = "not-an-int"

    assert package_type_values(Wave) == [19, 28]
