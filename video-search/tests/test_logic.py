import numpy as np
import pytest

from vsearch.attributes import aggregate, classify_color
from vsearch.query import parse_query
from vsearch.regions import Region, RegionError
from vsearch.tracking import IoUTracker
from vsearch.pipeline import evaluate
from conftest import FakeDetection


def test_region_rect_and_polygon():
    r = Region.from_json({"kind": "rect", "points": [[0.2, 0.2], [0.6, 0.8]]})
    assert len(r.points) == 4
    assert r.contains_box_center((0.3, 0.3, 0.5, 0.5))
    assert not r.contains_box_center((0.6, 0.1, 0.9, 0.3))
    tri = Region.from_json({"points": [[0, 0], [1, 0], [0, 1]]})
    assert tri.contains(0.2, 0.2) and not tri.contains(0.8, 0.8)
    assert tri.contains(0.5, 0.0)  # on edge
    with pytest.raises(RegionError):
        Region.from_json({"points": [[0, 0], [1, 1]]})
    with pytest.raises(RegionError):
        Region.from_json({"points": [[0, 0], [2, 0], [0, 1]]})


def test_tracker_keeps_one_id_for_moving_object_and_splits_two():
    tr = IoUTracker(max_gap_s=0.5)
    ids = set()
    for i in range(20):
        t = i * 0.1
        a = FakeDetection((10 + 15 * i, 100, 90 + 15 * i, 160))
        b = FakeDetection((600 - 15 * i, 300, 680 - 15 * i, 360))
        out, _ = tr.update(t, [a, b])
        ids |= {o[0].track_id for o in out}
    assert len(ids) == 2


def test_tracker_fast_mover_matched_by_motion():
    tr = IoUTracker(max_gap_s=0.5)
    ids = set()
    for i in range(6):  # moves 70% of its width per frame → IoU drops near 0.2
        out, _ = tr.update(i * 0.2, [FakeDetection((100 + 56 * i, 100, 180 + 56 * i, 150))])
        ids.add(out[0][0].track_id)
    assert len(ids) == 1


def test_tracker_gap_ends_track():
    tr = IoUTracker(max_gap_s=0.5)
    o1, _ = tr.update(0.0, [FakeDetection((0, 0, 50, 50))])
    o2, fin = tr.update(2.0, [FakeDetection((0, 0, 50, 50))])
    assert fin and o1[0][0].track_id != o2[0][0].track_id


@pytest.mark.parametrize("bgr,name", [((250, 250, 250), "white"), ((15, 15, 15), "black"),
                                      ((30, 30, 200), "red"), ((200, 60, 20), "blue"), ((130, 130, 130), "gray")])
def test_color_solid(bgr, name):
    img = np.zeros((80, 120, 3), np.uint8); img[:] = bgr
    assert classify_color(img)["color"] == name


def test_color_mixed_is_undecided():
    img = np.zeros((80, 120, 3), np.uint8)
    img[:, :60] = (250, 250, 250); img[:, 60:] = (30, 30, 200)
    assert classify_color(img)["color"] is None


def test_aggregate_disputed_and_known():
    assert aggregate([{"c": "white"}] * 4 + [{"c": None}], "c")["status"] == "known"
    d = aggregate([{"c": "white"}, {"c": "white"}, {"c": "gray"}, {"c": "gray"}], "c")
    assert d["status"] == "disputed" and d["value"] is None
    assert aggregate([{"c": None}] * 3, "c")["status"] == "unknown"


def test_parse_hebrew_query():
    q = parse_query("מצא רכבי קיה לבנים שעברו באזור שסימנתי")
    assert q["types"] == ["passenger_car"] and q["colors"] == ["white"] and q["makes"] == ["Kia"]
    q = parse_query("רכב פרטי אדום")
    assert q["types"] == ["passenger_car"] and q["colors"] == ["red"]
    assert any("בעלות" in n for n in q["notes"])
    q = parse_query("משאית או אוטובוס כחול")
    assert set(q["types"]) == {"truck", "bus"} and q["colors"] == ["blue"]
    q = parse_query("הולך רגל")
    assert q["types"] == ["person"]
    assert parse_query("רכב")["types"] == ["passenger_car", "truck", "bus", "motorcycle"]
    # "לבנון" must not read as "לבן"
    assert parse_query("רכב בלבנון")["colors"] == []


def rec(color, make, obj_type="passenger_car", votes=None):
    return {"obj_type": obj_type, "type_votes": votes or {obj_type: 1.0}, "color": color, "make": make}


F = {"types": ["passenger_car"], "colors": ["white"], "makes": ["Kia"]}


def test_evaluate_white_car_without_make_stays_candidate():
    r = rec({"status": "known", "value": "white", "frames": 5}, {"status": "unavailable"})
    e = evaluate(r, F)
    assert e["category"] == "candidate" and e["checks"]["make"]["status"] == "uncertain"


def test_evaluate_other_color_excluded_unless_low_light():
    r = rec({"status": "known", "value": "blue", "frames": 4, "low_light_frames": 0}, {"status": "unavailable"})
    assert evaluate(r, F)["category"] == "excluded"
    r["color"]["low_light_frames"] = 3
    assert evaluate(r, F)["category"] == "candidate"


def test_evaluate_full_match_and_make_dispute():
    r = rec({"status": "known", "value": "white", "frames": 5}, {"status": "known", "value": "Kia"})
    assert evaluate(r, F)["category"] == "match"
    r["make"] = {"status": "disputed", "values": {"Kia": 2, "Hyundai": 2}}
    assert evaluate(r, F)["category"] == "candidate"
    r["make"] = {"status": "known", "value": "Toyota"}
    assert evaluate(r, F)["category"] == "excluded"


def test_evaluate_type_uncertain_when_votes_split():
    r = rec({"status": "known", "value": "white", "frames": 5}, {"status": "unavailable"}, "truck",
            {"truck": 0.6, "passenger_car": 0.4})
    assert evaluate(r, {"types": ["passenger_car"]})["category"] == "candidate"
