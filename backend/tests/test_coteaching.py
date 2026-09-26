"""Co-teaching: sharing a course with co-teachers (can edit) and viewers (read only)."""
import uuid

import pytest
from fastapi.testclient import TestClient

from app.main import app
from conftest import login_client


def _teacher(prefix):
    email = f"{prefix}-{uuid.uuid4().hex[:8]}@optiteach.edu"
    TestClient(app).post("/api/auth/register", json={"email": email, "password": "long-enough-pw", "full_name": prefix.title(),
                                                     "department": "CSE", "employee_id": f"{prefix}-{uuid.uuid4().hex[:6]}"})
    return email, login_client(email, "long-enough-pw")


@pytest.fixture(scope="module")
def team():
    owner_email, owner = _teacher("owner")
    co_email, co = _teacher("cot")
    viewer_email, viewer = _teacher("view")
    _, outsider = _teacher("out")
    cid = owner.post("/api/courses", json={"code": "CT101", "title": "Shared", "semester": "S1", "total_classes": 4}).json()["id"]
    owner.post(f"/api/courses/{cid}/curriculum/confirm", json={"units": [{"unit_number": 1, "title": "U", "topics": [
        {"title": "T", "concepts": [{"name": "c1"}, {"name": "c2"}]}]}]})
    return {"cid": cid, "owner": owner, "co": co, "viewer": viewer, "outsider": outsider,
            "owner_email": owner_email, "co_email": co_email, "viewer_email": viewer_email}


def test_owner_shares_course_and_roles_show_in_lists(team):
    cid, owner = team["cid"], team["owner"]
    assert owner.put(f"/api/courses/{cid}/members", json={"email": team["co_email"], "role": "co_teacher"}).status_code == 200
    resp = owner.put(f"/api/courses/{cid}/members", json={"email": team["viewer_email"], "role": "viewer"})
    assert resp.status_code == 200
    assert {m["role"] for m in resp.json()["members"]} == {"co_teacher", "viewer"}

    listed = {c["id"]: c["my_role"] for c in team["co"].get("/api/courses").json()}
    assert listed[cid] == "co_teacher"
    assert {c["id"]: c["my_role"] for c in team["viewer"].get("/api/courses").json()}[cid] == "viewer"
    assert cid not in {c["id"] for c in team["outsider"].get("/api/courses").json()}


def test_co_teacher_can_edit_viewer_can_only_read(team):
    cid = team["cid"]
    concepts = team["co"].get(f"/api/courses/{cid}/curriculum").json()["units"][0]["topics"][0]["concepts"]
    c1 = concepts[0]["id"]
    assert team["co"].patch(f"/api/courses/{cid}/concepts/{c1}", json={"difficulty": 4}).status_code == 200

    assert team["viewer"].get(f"/api/courses/{cid}/curriculum").status_code == 200
    blocked = team["viewer"].patch(f"/api/courses/{cid}/concepts/{c1}", json={"difficulty": 2})
    assert blocked.status_code == 403 and "view this course" in blocked.json()["detail"]
    assert team["outsider"].get(f"/api/courses/{cid}/curriculum").status_code == 404


def test_only_the_owner_manages_access(team):
    cid = team["cid"]
    assert team["co"].put(f"/api/courses/{cid}/members", json={"email": team["viewer_email"], "role": "co_teacher"}).status_code == 403
    assert team["owner"].put(f"/api/courses/{cid}/members", json={"email": team["owner_email"], "role": "viewer"}).status_code == 400
    assert team["owner"].put(f"/api/courses/{cid}/members", json={"email": "nobody@optiteach.edu", "role": "viewer"}).status_code == 404

    members = team["owner"].get(f"/api/courses/{cid}/members").json()["members"]
    viewer_id = next(m["teacher_id"] for m in members if m["role"] == "viewer")
    assert team["owner"].delete(f"/api/courses/{cid}/members/{viewer_id}").status_code == 204
    assert team["viewer"].get(f"/api/courses/{cid}").status_code == 404
