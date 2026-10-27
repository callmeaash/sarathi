from app.routing.nearest import FacilityIndex
from app.state import RoutingState, active_closures, apply_closure, lift_closure
from tests.conftest import graph_from

COORDS = {1: (85.30, 27.70), 2: (85.31, 27.70), 3: (85.32, 27.70)}
ROADS = [(1, 2, 60), (2, 1, 60), (2, 3, 60), (3, 2, 60)]  # edges 1000-1003


def make_state():
    return RoutingState(graph_from(COORDS, ROADS), FacilityIndex({}, 0))


def test_apply_closes_known_edges_and_ignores_unknown_ones():
    state = make_state()
    assert apply_closure(state, 1, [1000, 1001, 999]) == [1000, 1001]
    assert state.graph.is_closed(1000) and state.graph.is_closed(1001) and not state.graph.is_closed(1002)


def test_applying_the_same_incident_twice_changes_nothing():
    state = make_state()
    apply_closure(state, 1, [1000])
    assert apply_closure(state, 1, [1000, 1002]) == [1000]
    lift_closure(state, 1)
    assert state.graph.closed_edge_ids() == []


def test_a_road_stays_closed_until_every_incident_on_it_is_lifted():
    state = make_state()
    apply_closure(state, 1, [1000, 1001])
    apply_closure(state, 2, [1001, 1002])
    assert lift_closure(state, 1) == [1000]
    assert state.graph.is_closed(1001)
    assert sorted(lift_closure(state, 2)) == [1001, 1002]
    assert state.graph.closed_edge_ids() == []


def test_lifting_an_unknown_incident_does_nothing():
    state = make_state()
    apply_closure(state, 1, [1000])
    assert lift_closure(state, 7) == []
    assert state.graph.is_closed(1000)


def test_active_closures_is_a_copy():
    state = make_state()
    apply_closure(state, 1, [1000])
    snapshot = active_closures(state)
    snapshot[1].append(1002)
    snapshot[2] = [1003]
    assert state.closures == {1: [1000]}
