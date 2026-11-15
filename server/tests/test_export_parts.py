"""High quality exports: bigger files stored in parts and joined on download."""

from karaokesync import export_parts as ep

from .test_exports import AUTH, ready_project  # noqa: F401 - fixture


class Store:
    def __init__(self):
        self.objects = {}

    def upload_file(self, bucket, path, local, content_type):
        self.objects[path] = open(local, "rb").read()


def test_small_files_stay_whole(tmp_path, monkeypatch):
    f = tmp_path / "v.mp4"
    f.write_bytes(b"x" * 1000)
    store = Store()
    assert ep.upload_in_parts(store, "exports", "u/p/j.mp4", f) == "u/p/j.mp4"
    assert list(store.objects) == ["u/p/j.mp4"]
    assert ep.part_paths("u/p/j.mp4") == ["u/p/j.mp4"]


def test_big_files_are_stored_in_parts_that_join_back(tmp_path, monkeypatch):
    monkeypatch.setattr(ep, "PART_BYTES", 400)
    f = tmp_path / "v.mp4"
    data = bytes(range(256)) * 4   # 1024 bytes -> 3 parts
    f.write_bytes(data)
    store = Store()
    path = ep.upload_in_parts(store, "exports", "u/p/j.mp4", f)
    assert path == "u/p/j.mp4.parts3"
    assert ep.part_paths(path) == ["u/p/j.mp4.part0", "u/p/j.mp4.part1", "u/p/j.mp4.part2"]
    assert b"".join(store.objects[p] for p in ep.part_paths(path)) == data
    assert all(len(store.objects[p]) <= 400 for p in ep.part_paths(path))
    assert not list(tmp_path.glob("*.part*"))   # pieces on disk are removed


def test_quality_option_and_deleting_parts(client, fake_sb, ready_project, tmp_path):  # noqa: F811
    pid = ready_project["id"]
    job = client.post(f"/projects/{pid}/exports", json={"quality": "high"}, headers=AUTH).json()
    assert job["options"]["quality"] == "high"
    fake_sb.update("export_jobs", {"id": f"eq.{job['id']}"}, {"status": "succeeded", "output_path": "u/p/j.mp4.parts2"})
    for k in range(2):
        fake_sb.put_object("exports", f"u/p/j.mp4.part{k}", tmp_path / f"p{k}")
    assert client.delete(f"/exports/{job['id']}", headers=AUTH).status_code == 204
    assert fake_sb.objects["exports"] == {}
    # a preview is never "high quality"
    prev = client.post(f"/projects/{pid}/exports", json={"quality": "high", "preview": True}, headers=AUTH).json()
    assert "quality" not in prev["options"]


def test_high_quality_keeps_1080p_for_a_long_song():
    from karaokesync.exports.video import best_resolution

    assert best_resolution(1080, 4 * 60_000, 48 * 1024 * 1024) == 720
    assert best_resolution(1080, 4 * 60_000, 150 * 1024 * 1024) == 1080
