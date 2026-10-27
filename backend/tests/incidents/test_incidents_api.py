from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.auth.email import MemoryEmail
from app.auth.tokens import create_access_token
from app.main import create_app
from app.state import active_closures, lift_closure
from tests.conftest import TEST_AUTH, needs_db
from tests.seed import NODES, route, seed_network

pytestmark = needs_db

WEST_ROAD = "Kalimati Marg"           # road 0-4, stored as edges 16 and 17
ON_WEST_ROAD = (85.2980, 27.7000)
NEAR_WEST_ROAD = (85.2982, 27.7000)   # 20 m along the same road
ON_NORTH_ROAD = (85.3000, 27.7050)    # road 0-2
ON_RIVER_ROAD = (85.3010, 27.7100)    # road 2-3
MAP = "85.29,27.69,85.31,27.72"
USERS = {  # key: (full name, role, email verified)
    "asha": ("Asha Gurung", "user", True),
    "bikash": ("Bikash Thapa", "user", True),
    "chandra": ("Chandra Rai", "user", False),
    "mod": ("Maya Shrestha", "moderator", True),
}


@pytest.fixture(scope="module")
def app_client(db_engine):
    seed_network(db_engine, road_names={(0, 4): WEST_ROAD})
    ids = {}
    with db_engine.begin() as conn:
        conn.execute(text("TRUNCATE users RESTART IDENTITY CASCADE"))
        for key, (name, role, verified) in USERS.items():
            ids[key] = conn.execute(text("""
                INSERT INTO users (email, full_name, password_hash, role, email_verified)
                VALUES (:email, :name, 'not-a-real-hash', :role, :verified) RETURNING id
            """), {"email": f"{key}@example.com", "name": name, "role": role, "verified": verified}).scalar_one()
    now = datetime.now(timezone.utc)
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as c:
        c.db = db_engine
        c.user_ids = ids
        c.tokens = {key: create_access_token(TEST_AUTH, ids[key], USERS[key][1], now) for key in USERS}
        yield c


@pytest.fixture
def client(app_client):
    yield app_client
    state = app_client.app.state.routing
    for incident_id in active_closures(state):
        lift_closure(state, incident_id)
    sql(app_client, "TRUNCATE incidents, audit_log RESTART IDENTITY")


def sql(client, statement, **params):
    with client.db.begin() as conn:
        result = conn.execute(text(statement), params)
        return result.all() if result.returns_rows else None


def as_(client, who):
    return {"Authorization": f"Bearer {client.tokens[who]}"} if who else {}


def report(client, who="asha", kind="landslide", at=ON_WEST_ROAD, **extra):
    body = {"kind": kind, "lon": at[0], "lat": at[1], **extra}
    return client.post("/api/incidents", json=body, headers=as_(client, who))


def reported(client, **kwargs) -> int:
    response = report(client, **kwargs)
    assert response.status_code == 201, response.text
    return response.json()["id"]


def act(client, incident_id, action, who="mod", **body):
    return client.post(f"/api/incidents/{incident_id}/{action}", json=body or None, headers=as_(client, who))


def west_hospital_reachable(client) -> bool:
    body = client.get("/api/nearest", params={"lon": NODES[0][0], "lat": NODES[0][1]}).json()
    return "West Hospital" in [r["facility"]["name"] for r in body["results"]]


# --- reporting ---

def test_reporting_needs_a_verified_account(client):
    assert report(client, who=None).status_code == 401
    response = report(client, who="chandra")
    assert response.status_code == 403 and "verify your email" in response.json()["detail"]


def test_report_is_snapped_onto_the_road(client):
    response = report(client, at=(85.2980, 27.7005), passable="no", note="  Big   rocks on the road ")
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending" and body["passable"] == "no" and body["note"] == "Big rocks on the road"
    assert (body["lon"], body["lat"]) == pytest.approx(ON_WEST_ROAD, abs=1e-6)
    assert body["road_name"] == WEST_ROAD
    assert body["snap_distance_m"] == pytest.approx(55.4, abs=1)
    assert body["closure_radius_m"] is None and body["reviewed_at"] is None
    assert "reporter_id" not in body
    (dropped,) = sql(client, "SELECT ST_X(reported_geom) AS lon, ST_Y(reported_geom) AS lat FROM incidents")
    assert (dropped.lon, dropped.lat) == pytest.approx((85.2980, 27.7005))


def test_passable_defaults_to_unsure_and_blank_notes_are_dropped(client):
    body = report(client, note="   ").json()
    assert body["passable"] == "unsure" and body["note"] is None


def test_report_far_from_any_road_is_rejected(client):
    response = report(client, at=(85.2980, 27.7050))
    assert response.status_code == 422 and "no road within 150 m" in response.json()["detail"]


@pytest.mark.parametrize("extra", [{"kind": "meteor"}, {"passable": "maybe"}, {"note": "x" * 201},
                                   {"note": "x" * 1001}])
def test_report_rejects_bad_input(client, extra):
    assert report(client, **extra).status_code == 422


def test_report_rejects_bad_coordinates(client):
    assert report(client, at=(85.3, 95)).status_code == 422


def test_repeat_report_is_a_conflict_but_other_kinds_and_people_are_not(client):
    reported(client)
    response = report(client, at=NEAR_WEST_ROAD)
    assert response.status_code == 409 and "already reported" in response.json()["detail"]
    assert report(client, kind="flood").status_code == 201
    assert report(client, who="bikash").status_code == 201


def test_a_reviewed_report_can_be_reported_again(client):
    act(client, reported(client), "reject", reason="Could not confirm")
    assert report(client).status_code == 201


def test_reports_are_rate_limited(client):
    sql(client, """
        INSERT INTO incidents (reporter_id, kind, geom, reported_geom, snap_distance_m, created_at)
        SELECT :user, 'other', p, p, 0, now() - interval '50 minutes'
        FROM (SELECT ST_SetSRID(ST_MakePoint(85.29, 27.69), 4326) AS p) s, generate_series(1, 10)
    """, user=client.user_ids["asha"])
    response = report(client)
    assert response.status_code == 429
    assert 590 <= int(response.headers["Retry-After"]) <= 601  # until the oldest report is an hour old
    assert report(client, who="bikash").status_code == 201


def test_older_reports_do_not_count_towards_the_limit(client):
    sql(client, """
        INSERT INTO incidents (reporter_id, kind, geom, reported_geom, snap_distance_m, created_at)
        SELECT :user, 'other', p, p, 0, now() - interval '61 minutes'
        FROM (SELECT ST_SetSRID(ST_MakePoint(85.29, 27.69), 4326) AS p) s, generate_series(1, 10)
    """, user=client.user_ids["asha"])
    assert report(client).status_code == 201


# --- what the public sees ---

def test_map_shows_pending_and_verified_reports_but_not_rejected_ones(client):
    verified = reported(client)
    rejected = reported(client, kind="flood", at=ON_NORTH_ROAD)
    pending = reported(client, who="bikash", kind="accident", at=ON_RIVER_ROAD)
    act(client, verified, "verify")
    act(client, rejected, "reject", reason="Photo shows a different road")

    body = client.get("/api/incidents", params={"bbox": MAP}).json()
    assert [i["id"] for i in body] == [pending, verified]  # newest first
    only_verified = client.get("/api/incidents", params={"bbox": MAP, "status": "verified"}).json()
    assert [i["id"] for i in only_verified] == [verified]
    assert client.get(f"/api/incidents/{verified}").status_code == 200
    assert client.get(f"/api/incidents/{rejected}").status_code == 404


def test_cleared_reports_are_shown_only_when_asked_for(client):
    incident = reported(client)
    act(client, incident, "verify")
    act(client, incident, "clear")
    assert client.get("/api/incidents", params={"bbox": MAP}).json() == []
    cleared = client.get("/api/incidents", params={"bbox": MAP, "status": "cleared"}).json()
    assert [i["id"] for i in cleared] == [incident] and cleared[0]["cleared_at"] is not None


def test_map_only_returns_reports_in_the_area(client):
    reported(client)
    assert client.get("/api/incidents", params={"bbox": "85.30,27.705,85.31,27.72"}).json() == []


@pytest.mark.parametrize("params", [{}, {"bbox": "1,2,3"}, {"bbox": MAP, "status": "rejected"}])
def test_map_rejects_bad_parameters(client, params):
    assert client.get("/api/incidents", params=params).status_code == 422


def test_unknown_report(client):
    assert client.get("/api/incidents/999").status_code == 404


def test_my_reports_include_rejections_with_the_reason(client):
    first = reported(client)
    second = reported(client, kind="flood", at=ON_NORTH_ROAD)
    act(client, first, "reject", reason="  Could not   confirm ")
    mine = client.get("/api/incidents/mine", headers=as_(client, "asha")).json()
    assert [i["id"] for i in mine] == [second, first]
    assert mine[1]["status"] == "rejected" and mine[1]["review_note"] == "Could not confirm"
    assert client.get("/api/incidents/mine", headers=as_(client, "bikash")).json() == []
    assert client.get("/api/incidents/mine").status_code == 401


# --- moderation ---

def test_queue_and_actions_are_for_moderators_only(client):
    incident = reported(client)
    assert client.get("/api/moderation/queue").status_code == 401
    assert client.get("/api/moderation/queue", headers=as_(client, "asha")).status_code == 403
    for action, body in [("verify", {}), ("reject", {"reason": "Not real"}), ("clear", {}), ("merge", {"into_id": 1})]:
        assert act(client, incident, action, who="asha", **body).status_code == 403
    assert client.get("/api/audit", headers=as_(client, "asha")).status_code == 403


def test_queue_is_oldest_first_with_the_reporters_record_and_similar_reports(client):
    act(client, reported(client, at=ON_NORTH_ROAD), "verify")
    act(client, reported(client, kind="flood", at=ON_RIVER_ROAD), "reject", reason="Not flooded")
    first = reported(client)
    second = reported(client, who="bikash", kind="accident", at=NEAR_WEST_ROAD)
    alone = reported(client, who="bikash", kind="road_works", at=ON_RIVER_ROAD)

    queue = client.get("/api/moderation/queue", headers=as_(client, "mod")).json()
    assert [i["id"] for i in queue] == [first, second, alone]
    asha, bikash, _ = queue
    assert asha["reporter"] == {"id": client.user_ids["asha"], "name": "Asha Gurung", "verified_reports": 1,
                                "reviewed_reports": 2}
    assert bikash["reporter"]["verified_reports"] == 0 and bikash["reporter"]["reviewed_reports"] == 0
    assert [i["similar_reports"] for i in queue] == [1, 1, 0]


def test_queue_survives_a_deleted_reporter(client):
    reported(client, who="bikash")
    sql(client, "UPDATE incidents SET reporter_id = NULL")
    (item,) = client.get("/api/moderation/queue", headers=as_(client, "mod")).json()
    assert item["reporter"] is None


def test_verify_closes_the_roads_and_changes_routes(client):
    assert route(client, 4, 0).status_code == 200 and west_hospital_reachable(client)
    incident = reported(client)
    response = act(client, incident, "verify")
    assert response.status_code == 200
    body = response.json()
    assert body["closed_edges"] == 2 and body["reopened_edges"] == 0
    assert body["incident"]["status"] == "verified" and body["incident"]["closure_radius_m"] == 30
    assert route(client, 4, 0).status_code == 404 and not west_hospital_reachable(client)
    assert client.get("/api/health").json()["closed_edges"] == 2


def test_verify_with_a_chosen_radius(client):
    incident = reported(client, at=(85.2998, 27.7000))  # 20 m from junction 0, where roads 0-2 and 0-4 meet
    body = act(client, incident, "verify", radius_m=25).json()
    assert body["closed_edges"] == 4 and body["incident"]["closure_radius_m"] == 25


@pytest.mark.parametrize("radius", [4, 201, 0, -10])
def test_verify_rejects_a_bad_radius(client, radius):
    incident = reported(client)
    assert act(client, incident, "verify", radius_m=radius).status_code == 422
    assert client.get(f"/api/incidents/{incident}").json()["status"] == "pending"


def test_each_report_is_reviewed_only_once(client):
    incident = reported(client)
    assert act(client, incident, "verify").status_code == 200
    response = act(client, incident, "verify")
    assert response.status_code == 409 and "is verified" in response.json()["detail"]
    assert act(client, incident, "reject", reason="Changed my mind").status_code == 409
    assert act(client, incident, "merge", into_id=incident + 1).status_code == 409
    assert len(active_closures(client.app.state.routing)[incident]) == 2  # not closed twice


@pytest.mark.parametrize("action, body", [("verify", {}), ("reject", {"reason": "Not real"}), ("clear", {}),
                                          ("merge", {"into_id": 1})])
def test_actions_on_unknown_reports(client, action, body):
    assert act(client, 999, action, **body).status_code == 404


@pytest.mark.parametrize("reason", ["", "no", "     ", "x" * 301])
def test_reject_needs_a_reason(client, reason):
    incident = reported(client)
    assert act(client, incident, "reject", reason=reason).status_code == 422


def test_reject_keeps_the_roads_open(client):
    incident = reported(client)
    body = act(client, incident, "reject", reason="Road is open, checked with traffic police").json()
    assert body["incident"]["status"] == "rejected" and body["closed_edges"] == 0
    assert route(client, 4, 0).status_code == 200


def test_clear_reopens_the_roads(client):
    incident = reported(client)
    act(client, incident, "verify")
    response = act(client, incident, "clear")
    assert response.status_code == 200
    body = response.json()
    assert body["reopened_edges"] == 2 and body["incident"]["status"] == "cleared"
    assert route(client, 4, 0).status_code == 200 and west_hospital_reachable(client)
    assert act(client, incident, "clear").status_code == 409


def test_only_verified_reports_can_be_cleared(client):
    response = act(client, reported(client), "clear")
    assert response.status_code == 409 and "only verified reports" in response.json()["detail"]


def test_overlapping_hazards_keep_the_road_closed_until_both_are_cleared(client):
    first = reported(client, at=(85.2975, 27.7000))
    second = reported(client, who="bikash", kind="flood", at=(85.2985, 27.7000))
    assert act(client, first, "verify").json()["closed_edges"] == 2
    assert act(client, second, "verify").json()["closed_edges"] == 2
    assert act(client, first, "clear").json()["reopened_edges"] == 0
    assert route(client, 4, 0).status_code == 404
    assert act(client, second, "clear").json()["reopened_edges"] == 2
    assert route(client, 4, 0).status_code == 200


def test_merge_marks_a_duplicate(client):
    original = reported(client)
    duplicate = reported(client, who="bikash", at=NEAR_WEST_ROAD)
    body = act(client, duplicate, "merge", into_id=original).json()
    assert body["incident"]["status"] == "merged" and body["incident"]["merged_into_id"] == original
    assert act(client, duplicate, "merge", into_id=original).status_code == 409
    assert client.get(f"/api/incidents/{duplicate}").status_code == 404
    assert act(client, original, "verify").json()["closed_edges"] == 2


def test_merge_into_a_verified_report(client):
    original = reported(client)
    act(client, original, "verify")
    duplicate = reported(client, who="bikash", at=NEAR_WEST_ROAD)
    assert act(client, duplicate, "merge", into_id=original).status_code == 200


def test_merge_rules(client):
    report_id = reported(client)
    rejected = reported(client, who="bikash", kind="flood", at=ON_NORTH_ROAD)
    act(client, rejected, "reject", reason="Not flooded")
    assert act(client, report_id, "merge", into_id=report_id).status_code == 422
    assert act(client, report_id, "merge", into_id=999).status_code == 404
    response = act(client, report_id, "merge", into_id=rejected)
    assert response.status_code == 409 and "is rejected" in response.json()["detail"]
    assert client.get(f"/api/incidents/{report_id}").json()["status"] == "pending"


# --- closures ---

def test_closures_list_the_closed_roads(client):
    assert client.get("/api/closures").json() == []
    incident = reported(client)
    act(client, incident, "verify")
    (closure,) = client.get("/api/closures").json()
    assert closure["incident_id"] == incident and closure["kind"] == "landslide"
    assert closure["road_name"] == WEST_ROAD and closure["radius_m"] == 30 and closure["edges"] == 2
    assert closure["geometry"]["type"] == "MultiLineString" and len(closure["geometry"]["coordinates"]) == 2
    act(client, incident, "clear")
    assert client.get("/api/closures").json() == []


def test_closures_survive_a_restart(client, db_engine):
    incident = reported(client)
    act(client, incident, "verify")
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as restarted:
        assert route(restarted, 4, 0).status_code == 404
        assert [c["incident_id"] for c in restarted.get("/api/closures").json()] == [incident]
    act(client, incident, "clear")
    with TestClient(create_app(engine=db_engine, auth_settings=TEST_AUTH, sender=MemoryEmail())) as restarted:
        assert route(restarted, 4, 0).status_code == 200


# --- audit log ---

def test_audit_log_records_who_did_what(client):
    verified = reported(client)
    rejected = reported(client, kind="flood", at=ON_NORTH_ROAD)
    act(client, verified, "verify")
    act(client, rejected, "reject", reason="Not flooded")
    act(client, verified, "clear")

    entries = client.get("/api/audit", headers=as_(client, "mod")).json()
    assert [(e["action"], e["target_id"]) for e in entries] == [("clear", verified), ("reject", rejected),
                                                                ("verify", verified)]
    assert {e["actor_name"] for e in entries} == {"Maya Shrestha"}
    assert {e["target_type"] for e in entries} == {"incident"}
    clear_entry, reject_entry, verify_entry = entries
    assert verify_entry["details"] == {"radius_m": 30, "closed_edges": 2, "road": WEST_ROAD}
    assert reject_entry["details"] == {"reason": "Not flooded"}
    assert clear_entry["details"] == {"closed_edges": 2}


def test_audit_log_pages(client):
    for kind in ("landslide", "flood", "accident"):
        act(client, reported(client, kind=kind), "reject", reason="Duplicate")
    first_page = client.get("/api/audit", params={"limit": 2}, headers=as_(client, "mod")).json()
    assert len(first_page) == 2
    rest = client.get("/api/audit", params={"limit": 2, "before_id": first_page[-1]["id"]},
                      headers=as_(client, "mod")).json()
    assert len(rest) == 1 and rest[0]["id"] < first_page[-1]["id"]


def test_failed_actions_are_not_audited(client):
    incident = reported(client)
    act(client, incident, "clear")
    act(client, incident, "verify", radius_m=500)
    assert client.get("/api/audit", headers=as_(client, "mod")).json() == []
