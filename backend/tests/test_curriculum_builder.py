"""Curriculum builder: layout saves, prerequisite links with cycle checks, concept edits."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from conftest import login_client


@pytest.fixture(scope="module")
def course():
    email = f"cb-{uuid.uuid4().hex[:8]}@optiteach.edu"
    TestClient(app).post("/api/auth/register", json={
        "email": email, "password": "long-enough-pw", "full_name": "Builder Teacher",
        "department": "CSE", "employee_id": f"CB-{uuid.uuid4().hex[:6]}",
    })
    client = login_client(email, "long-enough-pw")
    course_id = client.post("/api/courses", json={"code": "CB101", "title": "Builder", "semester": "S1", "total_classes": 10}).json()["id"]
    confirmed = client.post(f"/api/courses/{course_id}/curriculum/confirm", json={"units": [
        {"unit_number": 1, "title": "Basics", "topics": [
            {"title": "Sets", "concepts": [{"name": "Set", "concept_type": "conceptual"}]},
            {"title": "Relations", "concepts": [{"name": "Relation", "concept_type": "conceptual", "prerequisites": ["Set"]}]},
        ]},
        {"unit_number": 2, "title": "Keys", "topics": [
            {"title": "Keys", "concepts": [{"name": "Key", "concept_type": "analytical", "prerequisites": ["Relation"]}]},
        ]},
    ]})
    assert confirmed.status_code == 200, confirmed.text
    return client, course_id


def ids(client, course_id):
    s = client.get(f"/api/courses/{course_id}/curriculum").json()
    concepts = {c["name"]: c for u in s["units"] for t in u["topics"] for c in t["concepts"]}
    topics = {t["title"]: t for u in s["units"] for t in u["topics"]}
    units = {u["title"]: u for u in s["units"]}
    return s, units, topics, concepts


def test_structure_lists_units_topics_concepts_and_links(course):
    client, cid = course
    s, units, topics, concepts = ids(client, cid)
    assert [u["title"] for u in s["units"]] == ["Basics", "Keys"]
    assert [t["title"] for t in units["Basics"]["topics"]] == ["Sets", "Relations"]
    assert concepts["Relation"]["prerequisite_ids"] == [concepts["Set"]["id"]]


def test_prerequisite_cycle_duplicate_and_self_links_are_refused(course):
    client, cid = course
    _, _, _, c = ids(client, cid)
    url = f"/api/courses/{cid}/prerequisites"

    loop = client.post(url, json={"concept_id": c["Set"]["id"], "prerequisite_id": c["Key"]["id"]})
    assert loop.status_code == 409 and "loop" in loop.json()["detail"]

    dup = client.post(url, json={"concept_id": c["Relation"]["id"], "prerequisite_id": c["Set"]["id"]})
    assert dup.status_code == 409

    self_link = client.post(url, json={"concept_id": c["Set"]["id"], "prerequisite_id": c["Set"]["id"]})
    assert self_link.status_code == 400


def test_add_and_remove_prerequisite(course):
    client, cid = course
    _, _, _, c = ids(client, cid)
    url = f"/api/courses/{cid}/prerequisites"
    assert client.post(url, json={"concept_id": c["Key"]["id"], "prerequisite_id": c["Set"]["id"]}).status_code == 201
    _, _, _, c2 = ids(client, cid)
    assert c["Set"]["id"] in c2["Key"]["prerequisite_ids"]

    params = f"?concept_id={c['Key']['id']}&prerequisite_id={c['Set']['id']}"
    assert client.delete(url + params).status_code == 204
    assert client.delete(url + params).status_code == 404

    versions = client.get(f"/api/courses/{cid}/graph/versions").json()
    assert versions[0]["reason"] == "Prerequisite removed in curriculum builder"


def test_layout_reorders_and_moves_topics_atomically(course):
    client, cid = course
    _, units, topics, _ = ids(client, cid)
    layout = {"units": [
        {"unit_id": units["Basics"]["id"], "topic_ids": [topics["Relations"]["id"]]},
        {"unit_id": units["Keys"]["id"], "topic_ids": [topics["Sets"]["id"], topics["Keys"]["id"]]},
    ]}
    resp = client.put(f"/api/courses/{cid}/curriculum/layout", json=layout)
    assert resp.status_code == 200, resp.text
    moved = {u["title"]: [t["title"] for t in u["topics"]] for u in resp.json()["units"]}
    assert moved == {"Basics": ["Relations"], "Keys": ["Sets", "Keys"]}

    # Leaving a topic out is refused and changes nothing
    bad = {"units": [{"unit_id": units["Basics"]["id"], "topic_ids": [topics["Relations"]["id"]]}]}
    assert client.put(f"/api/courses/{cid}/curriculum/layout", json=bad).status_code == 400
    after = {u["title"]: [t["title"] for t in u["topics"]] for u in ids(client, cid)[0]["units"]}
    assert after == moved


def test_concept_edit_reoptimizes_and_validates(course):
    client, cid = course
    _, _, _, c = ids(client, cid)
    url = f"/api/courses/{cid}/concepts/{c['Key']['id']}"
    resp = client.patch(url, json={"difficulty": 5, "importance": 5})
    assert resp.status_code == 200, resp.text
    assert {"allocated_minutes_before", "allocated_minutes_after"} <= resp.json().keys()
    assert ids(client, cid)[3]["Key"]["difficulty"] == 5
    assert client.patch(url, json={"difficulty": 9}).status_code == 422
    assert client.patch(url, json={"concept_type": "magic"}).status_code == 422


def test_other_teachers_cannot_edit(course, api):
    _, cid = course
    assert api.get(f"/api/courses/{cid}/curriculum").status_code == 404
