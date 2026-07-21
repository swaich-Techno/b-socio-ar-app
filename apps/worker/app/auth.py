from __future__ import annotations

from secrets import compare_digest


def worker_secret_matches(authorization: str | None, expected: str) -> bool:
    if not authorization or not authorization.startswith("Bearer "):
        return False
    return compare_digest(authorization.removeprefix("Bearer "), expected)
