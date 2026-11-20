from app.services.ttd.manual_release import (
    create_manual_release_group,
    get_manual_release_gate,
    release_manual_group,
)


def test_manual_release_group_starts_blocked():
    release_id = create_manual_release_group()
    gate = get_manual_release_gate(release_id)

    assert gate is not None
    assert gate.is_set() is False


def test_manual_release_group_opens_explicitly():
    release_id = create_manual_release_group()
    gate = get_manual_release_gate(release_id)

    assert gate is not None
    assert release_manual_group(release_id) is False
    assert gate.is_set() is True
    assert release_manual_group(release_id) is True


def test_unknown_manual_release_group_is_rejected():
    assert get_manual_release_gate("missing") is None
    assert release_manual_group("missing") is None
