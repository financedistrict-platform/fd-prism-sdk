from __future__ import annotations

from typing import Mapping, Optional, TypeVar

T = TypeVar('T')

WILDCARD_SUFFIX = '/*'


def validate_route_pattern(pattern: object) -> str:
    if not isinstance(pattern, str) or not pattern.startswith('/'):
        raise ValueError(f"Route pattern must be a string starting with '/': {pattern!r}")
    if '*' in pattern and not (pattern.endswith(WILDCARD_SUFFIX) and pattern.count('*') == 1):
        raise ValueError(
            f"Route pattern {pattern!r} is invalid: '*' is only allowed as a trailing '/*' segment"
        )
    return pattern


def route_prefix(pattern: str) -> str:
    if pattern.endswith(WILDCARD_SUFFIX):
        return pattern[:-len(WILDCARD_SUFFIX)]
    return pattern.rstrip('/')


def find_route(path: str, routes: Mapping[str, T]) -> Optional[T]:
    if path in routes:
        return routes[path]

    for pattern, config in routes.items():
        prefix = route_prefix(pattern)
        if path == prefix or path.startswith(prefix + '/'):
            return config

    return None
