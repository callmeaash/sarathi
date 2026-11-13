from datetime import datetime, timedelta, timezone

import pytest

from tests.conftest import needs_db
from tests.incidents.conftest import WEST_ROAD
from tests.incidents.test_incidents_api import (
    NEAR_WEST_ROAD, ON_NORTH_ROAD, ON_RIVER_ROAD, ON_WEST_ROAD, act, as_, reported, sql,
)

pytestmark = needs_db


def get(client, path, who="mod", **params):
    return client.get(f"/api/moderation/{path}", params=params, headers=as_(client, who))


def user_action(client, who, action, as_who="mod", **body):
    return client.post(f"/api/moderation/users/{client.user_ids[who]}/{action}", json=body or None,
                       headers=as_(client, as_who))


def users(client, **params) -> dict:
    response = get(client, "users", **params)
    assert response.status_code == 200, response.text
    return response.json()


# --- who may use it ---

@pytest.mark.parametrize("path", ["stats", "incidents?status=verified", "incidents/1", "incidents/1/closure-preview",
                                  "users"])
def test_the_panel_is_for_moderators_only(client, path):
    reported(client)
    assert client.get(f"/api/moderation/{path}").status_code == 401
    assert client.get(f"/api/moderation/{path}", headers=as_(client, "asha")).status_code == 403


def test_user_actions_are_for_moderators_only(client):
    for action, body in [("suspend", {"reason": "Spam reports"}), ("reinstate", {}), ("role", {"role": "moderator"})]:
        assert client.post(f"/api/moderation/users/1/{action}", json=body).status_code == 401
        assert user_action(client, "bikash", action, as_who="asha", **body).status_code == 403


# --- overview numbers ---

def test_stats_start_empty(client):
    assert get(client, "stats").json() == {
        "pending": 0, "oldest_pending_at": None, "active_closures": 0, "closed_edges": 0, "reports_today": 0,
        "verified_today": 0, "rejected_today": 0, "median_verify_s": None}


def test_stats_count_the_queue_closures_and_todays_decisions(client):
    oldest = reported(client)
    reported(client, who="bikash", kind="flood", at=ON_RIVER_ROAD)
    act(client, reported(client, kind="accident", at=ON_NORTH_ROAD), "verify")
    act(client, reported(client, who="bikash", kind="road_works", at=ON_NORTH_ROAD), "reject", reason="Not there")
    long_ago = datetime.now(timezone.utc) - timedelta(days=3)
    sql(client, "UPDATE incidents SET created_at = :then WHERE id = :id", then=long_ago, id=oldest)

    stats = get(client, "stats").json()
    assert stats["pending"] == 2 and stats["reports_today"] == 3  # the old report is not from today
    assert datetime.fromisoformat(stats["oldest_pending_at"]) == long_ago
    assert stats["active_closures"] == 1 and stats["closed_edges"] == 2
    assert stats["verified_today"] == 1 and stats["rejected_today"] == 1
    assert 0 <= stats["median_verify_s"] < 60


def test_median_time_to_verify_is_over_the_last_week(client):
    now = datetime.now(timezone.utc)
    for index, minutes in enumerate((10, 20, 60)):
        incident = reported(client, kind=("landslide", "flood", "accident")[index], at=ON_NORTH_ROAD)
        act(client, incident, "verify")
        sql(client, "UPDATE incidents SET created_at = :created, reviewed_at = :reviewed WHERE id = :id",
            created=now - timedelta(minutes=minutes + 5), reviewed=now - timedelta(minutes=5), id=incident)
    old = reported(client, kind="road_works", at=ON_NORTH_ROAD)
    act(client, old, "verify")
    sql(client, "UPDATE incidents SET created_at = :created, reviewed_at = :reviewed WHERE id = :id",
        created=now - timedelta(days=30), reviewed=now - timedelta(days=20), id=old)
    assert get(client, "stats").json()["median_verify_s"] == pytest.approx(20 * 60, abs=1)


# --- decided reports and the single report view ---

def test_decided_reports_are_listed_by_status_newest_decision_first(client):
    verified = reported(client)
    rejected = reported(client, kind="flood", at=ON_NORTH_ROAD)
    cleared = reported(client, who="bikash", kind="accident", at=ON_RIVER_ROAD)
    reported(client, who="bikash", kind="road_works", at=ON_RIVER_ROAD)  # still pending: never listed here
    act(client, verified, "verify")
    act(client, rejected, "reject", reason="Not flooded")
    act(client, cleared, "verify")
    act(client, cleared, "clear")

    assert [i["id"] for i in get(client, "incidents", status="verified").json()] == [verified]
    (item,) = get(client, "incidents", status="rejected").json()
    assert item["id"] == rejected and item["review_note"] == "Not flooded" and item["reviewer_name"] == "Maya Shrestha"
    assert item["reporter"]["name"] == "Asha Gurung"
    both = get(client, "incidents", status=["verified", "cleared"]).json()
    assert [i["id"] for i in both] == [cleared, verified]
    assert [i["id"] for i in get(client, "incidents", status=["verified", "cleared"], limit=1, offset=1).json()] \
        == [verified]


def test_decided_reports_need_a_known_status(client):
    assert get(client, "incidents").status_code == 422
    assert get(client, "incidents", status="pending").status_code == 422


def test_a_report_can_be_opened_whatever_its_status(client):
    incident = reported(client, at=(85.2980, 27.7005), note="Rocks on the road")
    act(client, incident, "reject", reason="Could not confirm")
    assert client.get(f"/api/incidents/{incident}").status_code == 404  # not public
    body = get(client, f"incidents/{incident}").json()
    assert body["status"] == "rejected" and body["note"] == "Rocks on the road"
    assert (body["lon"], body["lat"]) == pytest.approx(ON_WEST_ROAD, abs=1e-6)
    assert (body["reported_lon"], body["reported_lat"]) == pytest.approx((85.2980, 27.7005))
    assert body["reporter"]["reviewed_reports"] == 1 and body["nearby"] == []
    assert get(client, "incidents/999").status_code == 404


def test_a_report_lists_the_open_reports_close_to_it(client):
    mine = reported(client)
    close = reported(client, who="bikash", kind="accident", at=NEAR_WEST_ROAD)
    closed_road = reported(client, who="bikash", kind="flood", at=NEAR_WEST_ROAD)
    act(client, closed_road, "verify")
    gone = reported(client, who="bikash", kind="road_works", at=NEAR_WEST_ROAD)
    act(client, gone, "reject", reason="Finished already")
    reported(client, who="bikash", kind="landslide", at=ON_RIVER_ROAD)  # too far away

    nearby = get(client, f"incidents/{mine}").json()["nearby"]
    assert [(n["id"], n["status"]) for n in nearby] == [(close, "pending"), (closed_road, "verified")]
    assert nearby[0]["distance_m"] == pytest.approx(19.7, abs=1) and nearby[0]["road_name"] == WEST_ROAD
    assert get(client, "queue").json()[0]["nearby"] == []  # only the single view fills it in


# --- what verifying would close ---

def test_closure_preview_shows_what_would_close_without_closing_it(client):
    incident = reported(client)
    preview = get(client, f"incidents/{incident}/closure-preview").json()
    assert preview["radius_m"] == 30 and preview["edges"] == 2 and preview["roads"] == [WEST_ROAD]
    assert preview["length_m"] == pytest.approx(394, abs=3)  # one 394 m road, not both directions added up
    assert preview["geometry"]["type"] == "MultiLineString"
    assert client.get("/api/health").json()["closed_edges"] == 0
    assert client.get(f"/api/incidents/{incident}").json()["status"] == "pending"


def test_closure_preview_grows_with_the_radius(client):
    incident = reported(client, at=(85.2998, 27.7000))  # 20 m from the junction of roads 0-2 and 0-4
    small = get(client, f"incidents/{incident}/closure-preview", radius_m=10).json()
    large = get(client, f"incidents/{incident}/closure-preview", radius_m=40).json()
    assert small["edges"] == 2 and large["edges"] > small["edges"] and large["length_m"] > small["length_m"]
    for radius in (4, 201):
        assert get(client, f"incidents/{incident}/closure-preview", radius_m=radius).status_code == 422
    assert get(client, "incidents/999/closure-preview").status_code == 404


def test_closures_report_the_length_of_road_closed(client):
    act(client, reported(client), "verify")
    (closure,) = client.get("/api/closures").json()
    assert closure["edges"] == 2 and closure["length_m"] == pytest.approx(394, abs=3)


# --- the audit log ---

def test_audit_entries_say_what_they_were_about_and_can_be_filtered(client):
    verified = reported(client)
    act(client, verified, "verify")
    act(client, reported(client, kind="flood", at=ON_NORTH_ROAD), "reject", reason="Not flooded")
    user_action(client, "bikash", "suspend", reason="Spam reports")

    entries = client.get("/api/audit", headers=as_(client, "mod")).json()
    suspend, reject, verify = entries
    assert (verify["incident_kind"], verify["incident_road"], verify["user_name"]) == ("landslide", WEST_ROAD, None)
    assert reject["incident_kind"] == "flood"
    assert (suspend["target_type"], suspend["user_name"], suspend["incident_kind"]) == ("user", "Bikash Thapa", None)
    assert suspend["details"] == {"name": "Bikash Thapa", "reason": "Spam reports"}

    only = client.get("/api/audit", params={"action": "verify"}, headers=as_(client, "mod")).json()
    assert [e["target_id"] for e in only] == [verified]
    assert client.get("/api/audit", params={"action": "nonsense"}, headers=as_(client, "mod")).status_code == 422


# --- accounts ---

def test_users_are_listed_newest_first_with_their_report_record(client):
    act(client, reported(client), "verify")
    act(client, reported(client, kind="flood", at=ON_NORTH_ROAD), "reject", reason="Not flooded")
    reported(client, kind="accident", at=ON_RIVER_ROAD)

    page = users(client)
    assert page["total"] == 4 and [u["full_name"] for u in page["items"]] == [
        "Maya Shrestha", "Chandra Rai", "Bikash Thapa", "Asha Gurung"]
    assert page["counts"] == {"users": 4, "moderators": 1, "suspended": 0, "unverified": 1}
    asha = page["items"][-1]
    assert (asha["reports"], asha["verified"], asha["rejected"]) == (3, 1, 1)
    assert asha["email"] == "asha@example.com" and asha["status"] == "active" and asha["email_verified"] is True
    assert "password_hash" not in asha


def test_users_can_be_searched_filtered_and_paged(client):
    assert [u["full_name"] for u in users(client, q="  gur ")["items"]] == ["Asha Gurung"]
    assert [u["full_name"] for u in users(client, q="BIKASH@example")["items"]] == ["Bikash Thapa"]
    assert users(client, q="%")["total"] == 0 and users(client, q="_sha")["total"] == 0  # not wildcards
    assert [u["full_name"] for u in users(client, role="moderator")["items"]] == ["Maya Shrestha"]
    assert [u["full_name"] for u in users(client, status="unverified")["items"]] == ["Chandra Rai"]
    assert users(client, status="suspended")["items"] == []
    page = users(client, limit=2, offset=2)
    assert page["total"] == 4 and [u["full_name"] for u in page["items"]] == ["Bikash Thapa", "Asha Gurung"]
    assert get(client, "users", role="admin").status_code == 422


def test_suspending_shuts_the_account_out_and_is_audited(client):
    response = user_action(client, "bikash", "suspend", reason="  Repeated   false reports ")
    assert response.status_code == 200 and response.json()["status"] == "suspended"
    assert client.get("/api/me", headers=as_(client, "bikash")).status_code == 403
    assert [u["full_name"] for u in users(client, status="suspended")["items"]] == ["Bikash Thapa"]
    assert users(client)["counts"]["suspended"] == 1
    (entry,) = client.get("/api/audit", headers=as_(client, "mod")).json()
    assert (entry["action"], entry["target_id"]) == ("suspend", client.user_ids["bikash"])
    assert entry["details"]["reason"] == "Repeated false reports"

    assert user_action(client, "bikash", "suspend", reason="Again").status_code == 409
    response = user_action(client, "bikash", "reinstate")
    assert response.status_code == 200 and response.json()["status"] == "active"
    assert client.get("/api/me", headers=as_(client, "bikash")).status_code == 200
    assert user_action(client, "bikash", "reinstate").status_code == 409


def test_suspending_ends_the_users_sessions(client):
    sql(client, """INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
                   VALUES (:user, 'abc', now() + interval '1 day')""", user=client.user_ids["bikash"])
    user_action(client, "bikash", "suspend", reason="Spam reports")
    assert sql(client, "SELECT revoke_reason FROM refresh_tokens") == [("suspended",)]


@pytest.mark.parametrize("body", [{}, {"reason": "x"}, {"reason": "x" * 301}])
def test_suspending_needs_a_reason(client, body):
    assert user_action(client, "bikash", "suspend", **body).status_code == 422


def test_roles_can_be_changed_and_take_effect(client):
    response = user_action(client, "asha", "role", role="moderator")
    assert response.status_code == 200 and response.json()["role"] == "moderator"
    assert get(client, "stats", who="asha").status_code == 200
    assert user_action(client, "asha", "role", role="moderator").status_code == 409
    (entry,) = client.get("/api/audit", headers=as_(client, "mod")).json()
    assert entry["action"] == "role" and entry["details"] == {"name": "Asha Gurung", "from": "user", "to": "moderator"}

    assert user_action(client, "asha", "role", role="user").json()["role"] == "user"
    assert get(client, "stats", who="asha").status_code == 403
    assert user_action(client, "asha", "role", role="admin").status_code == 422


def test_moderators_cannot_act_on_themselves_or_suspend_each_other(client):
    for action, body in [("suspend", {"reason": "Testing"}), ("reinstate", {}), ("role", {"role": "user"})]:
        response = user_action(client, "mod", action, **body)
        assert response.status_code == 422 and "your own account" in response.json()["detail"]
    user_action(client, "asha", "role", role="moderator")
    response = user_action(client, "asha", "suspend", reason="Disagreement")
    assert response.status_code == 409 and "change their role" in response.json()["detail"]


def test_only_confirmed_active_accounts_can_become_moderators(client):
    assert user_action(client, "chandra", "role", role="moderator").status_code == 409  # email not confirmed
    user_action(client, "bikash", "suspend", reason="Spam reports")
    assert user_action(client, "bikash", "role", role="moderator").status_code == 409


def test_user_actions_on_missing_accounts(client):
    for action, body in [("suspend", {"reason": "Spam reports"}), ("reinstate", {}), ("role", {"role": "moderator"})]:
        response = client.post(f"/api/moderation/users/9999/{action}", json=body, headers=as_(client, "mod"))
        assert response.status_code == 404
