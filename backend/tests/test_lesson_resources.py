"""Teaching resources attached to lesson plans (stored in the versioned MongoDB document)."""
from datetime import datetime, timezone

import pytest


@pytest.fixture
def plan(api):
    cid = next(c["id"] for c in api.get("/api/courses").json() if c["code"] == "CS302")
    return cid, api.get(f"/api/courses/{cid}/lesson-plans?session_number=18").json()[0]


def test_resources_are_saved_versioned_and_diffed(api, plan):
    cid, p = plan
    resources = [
        {"kind": "slides", "title": "Normalization deck", "url": "https://example.edu/slides/norm.pdf"},
        {"kind": "code", "title": "Closure algorithm", "content": "def closure(attrs, fds): ...", "language": "python"},
        {"kind": "formula", "title": "BCNF condition", "content": r"X \to Y \implies X \text{ is a superkey}"},
    ]
    resp = api.patch(f"/api/courses/{cid}/lesson-plans/18",
                     json={"expected_version": p["version"], "resources": resources, "change_note": "added material"})
    assert resp.status_code == 200, resp.text
    saved = resp.json()["resources"]
    assert [r["kind"] for r in saved] == ["slides", "code", "formula"]

    reread = api.get(f"/api/courses/{cid}/lesson-plans?session_number=18").json()[0]
    assert reread["resources"][1]["content"].startswith("def closure")

    history = api.get(f"/api/courses/{cid}/lesson-plans/18/history").json()
    diff = api.get(f"/api/courses/{cid}/lesson-plans/18/diff?from_version={history[1]['version']}&to_version={history[0]['version']}").json()
    assert len(diff["content"]["resources"]["added"]) == 3


@pytest.mark.parametrize("bad", [
    {"kind": "video", "title": "No link"},
    {"kind": "link", "title": "Not http", "url": "javascript:alert(1)"},
    {"kind": "code", "title": "Empty code", "content": "   "},
    {"kind": "podcast", "title": "Unknown kind", "url": "https://x.y"},
], ids=["missing-url", "non-http-url", "empty-content", "unknown-kind"])
def test_invalid_resources_are_rejected(api, plan, bad):
    cid, p = plan
    resp = api.patch(f"/api/courses/{cid}/lesson-plans/18", json={"expected_version": p["version"], "resources": [bad]})
    assert resp.status_code == 422


def test_mongo_validator_rejects_malformed_resource(real_mongo_db):
    from pymongo.errors import WriteError
    doc = {"lesson_plan_id": "lp-r", "course_id": "c", "session_number": 1, "version": 1,
           "phases": [{"phase_name": "Explain", "duration_minutes": 10}],
           "edited_at": datetime.now(timezone.utc).isoformat(),
           "resources": [{"kind": "hologram", "title": "x"}]}
    with pytest.raises(WriteError, match="Document failed validation"):
        real_mongo_db["lesson_plan_documents"].insert_one(doc)
