from __future__ import annotations

import asyncio
from dataclasses import dataclass
from uuid import uuid4


@dataclass(slots=True)
class ManualReleaseGroup:
    event: asyncio.Event
    released: bool = False


_groups: dict[str, ManualReleaseGroup] = {}


def create_manual_release_group() -> str:
    release_id = uuid4().hex
    _groups[release_id] = ManualReleaseGroup(event=asyncio.Event())
    return release_id


def get_manual_release_gate(release_id: str) -> asyncio.Event | None:
    group = _groups.get(release_id)
    return group.event if group is not None else None


def release_manual_group(release_id: str) -> bool | None:
    group = _groups.get(release_id)
    if group is None:
        return None

    already_released = group.released
    group.released = True
    group.event.set()
    return already_released
