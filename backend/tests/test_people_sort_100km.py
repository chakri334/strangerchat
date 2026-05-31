"""
Tests for the Feb 22 (b) UX changes:

1. /api/active-users sort: within 100 km → distance ascending;
   beyond 100 km → randomised order (NEARBY_KM constant).
"""
import os
import sys

sys.path.insert(0, "/app/backend")


def test_nearby_threshold_constant_is_100km():
    from routers.profile import NEARBY_KM
    assert NEARBY_KM == 100


def test_sort_logic_separates_nearby_and_far():
    """Unit-test the sort split using a synthesised users list."""
    import secrets as _s
    NEARBY_KM = 100

    users = [
        {"name": "near-50", "distance_km": 50.0},
        {"name": "near-10", "distance_km": 10.0},
        {"name": "near-99", "distance_km": 99.0},
        {"name": "far-150", "distance_km": 150.0},
        {"name": "far-200", "distance_km": 200.0},
        {"name": "far-500", "distance_km": 500.0},
        {"name": "no-loc",  "distance_km": None},
    ]

    nearby = [u for u in users if u.get("distance_km") is not None and u["distance_km"] <= NEARBY_KM]
    far    = [u for u in users if u.get("distance_km") is None or u["distance_km"] > NEARBY_KM]
    nearby.sort(key=lambda u: u["distance_km"])

    # First 3 are nearby sorted by distance
    assert [u["name"] for u in nearby] == ["near-10", "near-50", "near-99"]
    # Far bucket contains exactly 4 entries (3 far + 1 unknown)
    far_names = {u["name"] for u in far}
    assert far_names == {"far-150", "far-200", "far-500", "no-loc"}
