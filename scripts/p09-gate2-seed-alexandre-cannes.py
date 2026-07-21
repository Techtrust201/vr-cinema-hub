#!/usr/bin/env python3
"""P0.9 GATE 2 — seed ALEXANDRE-CANNES content on autonomous Supabase.

Requires env:
  SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Never prints secrets. Safe to run repeatedly (idempotent by names/paths).
"""
from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import sys
import urllib.error
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VIDEOS_DIR = ROOT / "videos-alex"

# Local fixtures → formats required by GATE 2
FIXTURES = [
    {
        "file": "dcb9717b-6aaa-4e54-bd37-ef83c83d909f-test-flat.mp4",
        "name": "ALEXANDRE-2D-FLAT",
        "format": "flat",
        "projection": "flat",
        "stereo_mode": "mono",
        "storage_path": "alexandre-cannes/2d-flat.mp4",
    },
    {
        "file": "4f79bd10-6822-42a7-8ae8-0c482bb7dcd6-test-180-mono.mp4",
        "name": "ALEXANDRE-180-MONO",
        "format": "180_mono",
        "projection": "180",
        "stereo_mode": "mono",
        "storage_path": "alexandre-cannes/180-mono.mp4",
    },
    {
        "file": "test-360-location.mp4",
        "name": "ALEXANDRE-360-MONO",
        "format": "360_mono",
        "projection": "360",
        "stereo_mode": "mono",
        "storage_path": "alexandre-cannes/360-mono.mp4",
    },
]

GROUP_NAME = "ALEXANDRE-CANNES"
PLAYLIST_NAME = "ALEXANDRE-CANNES-PLAYLIST"
HEADSET_NAME = "ALEXANDRE-CANNES-QUEST-05"


def die(msg: str, code: int = 1) -> None:
    print(f"ERROR: {msg}", file=sys.stderr)
    raise SystemExit(code)


def env(name: str) -> str:
    v = os.environ.get(name, "").strip()
    if not v:
        die(f"missing env {name}")
    return v


class SB:
    def __init__(self, url: str, key: str):
        self.url = url.rstrip("/")
        self.key = key

    def req(self, method: str, path: str, data=None, headers=None, raw: bool = False):
        h = {
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
        }
        if headers:
            h.update(headers)
        body = None
        if data is not None and not raw:
            body = json.dumps(data).encode()
            h.setdefault("Content-Type", "application/json")
        elif data is not None and raw:
            body = data
        request = urllib.request.Request(self.url + path, data=body, headers=h, method=method)
        try:
            with urllib.request.urlopen(request, timeout=120) as r:
                payload = r.read()
                if not payload:
                    return None
                ctype = r.headers.get("Content-Type", "")
                if "application/json" in ctype:
                    return json.loads(payload.decode())
                return payload
        except urllib.error.HTTPError as e:
            err = e.read().decode(errors="replace")[:500]
            die(f"{method} {path} -> HTTP {e.code}: {err}")

    def get(self, path: str):
        return self.req("GET", path)

    def post(self, path: str, data, prefer: str = "return=representation"):
        return self.req("POST", path, data=data, headers={"Prefer": prefer})

    def patch(self, path: str, data):
        return self.req("PATCH", path, data=data, headers={"Prefer": "return=representation"})

    def upload(self, bucket: str, storage_path: str, file_path: Path, content_type: str):
        raw = file_path.read_bytes()
        # upsert
        return self.req(
            "POST",
            f"/storage/v1/object/{bucket}/{storage_path}",
            data=raw,
            raw=True,
            headers={
                "Content-Type": content_type,
                "x-upsert": "true",
            },
        )


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def one_or_none(rows):
    if not rows:
        return None
    return rows[0]


def main() -> None:
    sb = SB(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"))
    admin_id = None
    users = sb.get("/auth/v1/admin/users?page=1&per_page=50")
    ulist = users.get("users", users if isinstance(users, list) else [])
    for u in ulist:
        if (u.get("email") or "").lower() == "contact@tech-trust.fr":
            admin_id = u["id"]
            break
    if not admin_id:
        die("admin user contact@tech-trust.fr not found")

    # --- Group ---
    group = one_or_none(sb.get(f"/rest/v1/headset_groups?name=eq.{GROUP_NAME}&select=*"))
    if not group:
        group = sb.post("/rest/v1/headset_groups", {"name": GROUP_NAME, "description": "Groupe Cannes Alexandre"})[0]
        print(f"created group {GROUP_NAME}")
    else:
        print(f"group exists {GROUP_NAME}")

    # --- Playlist ---
    playlist = one_or_none(sb.get(f"/rest/v1/playlists?name=eq.{PLAYLIST_NAME}&select=*"))
    if not playlist:
        playlist = sb.post(
            "/rest/v1/playlists",
            {
                "name": PLAYLIST_NAME,
                "description": "Playlist Cannes — 2D / 180 / 360",
                "created_by": admin_id,
            },
        )[0]
        print(f"created playlist {PLAYLIST_NAME}")
    else:
        print(f"playlist exists {PLAYLIST_NAME}")

    video_ids = []
    for i, fix in enumerate(FIXTURES):
        path = VIDEOS_DIR / fix["file"]
        if not path.is_file():
            die(f"missing fixture {path}")
        digest = sha256_file(path)
        size = path.stat().st_size
        ctype = mimetypes.guess_type(path.name)[0] or "video/mp4"

        existing = one_or_none(
            sb.get(f"/rest/v1/videos?storage_path=eq.{fix['storage_path']}&select=id,sha256,size_bytes,name")
        )
        if existing:
            vid = existing["id"]
            if existing.get("sha256") != digest or int(existing.get("size_bytes") or 0) != size:
                sb.patch(
                    f"/rest/v1/videos?id=eq.{vid}",
                    {"sha256": digest, "size_bytes": size, "name": fix["name"],
                     "format": fix["format"], "projection": fix["projection"],
                     "stereo_mode": fix["stereo_mode"]},
                )
            print(f"video row exists {fix['name']} sha256={digest[:12]}… size={size}")
        else:
            sb.upload("videos", fix["storage_path"], path, ctype)
            # verify download hash
            obj = sb.req("GET", f"/storage/v1/object/videos/{fix['storage_path']}")
            if isinstance(obj, (bytes, bytearray)):
                got = hashlib.sha256(obj).hexdigest()
                if got != digest:
                    die(f"upload hash mismatch for {fix['name']}")
            row = {
                "name": fix["name"],
                "library": "location",
                "format": fix["format"],
                "projection": fix["projection"],
                "stereo_mode": fix["stereo_mode"],
                "size_bytes": size,
                "storage_path": fix["storage_path"],
                "sha256": digest,
                "uploaded_by": admin_id,
                "description": f"GATE2 seed {fix['projection']}/{fix['stereo_mode']}",
            }
            created = sb.post("/rest/v1/videos", row)[0]
            vid = created["id"]
            print(f"created video {fix['name']} id={vid[:8]}… sha256={digest[:12]}… size={size}")

        # ensure storage object present (upload even if row existed)
        sb.upload("videos", fix["storage_path"], path, ctype)
        video_ids.append(vid)

        # playlist link
        link = one_or_none(
            sb.get(
                f"/rest/v1/playlist_videos?playlist_id=eq.{playlist['id']}&video_id=eq.{vid}&select=*"
            )
        )
        if not link:
            sb.post(
                "/rest/v1/playlist_videos",
                {"playlist_id": playlist["id"], "video_id": vid, "position": i},
                prefer="return=minimal",
            )
            print(f"linked video position={i}")

    # Assignment group <- playlist
    asg = one_or_none(
        sb.get(
            f"/rest/v1/assignments?target_type=eq.group&target_id=eq.{group['id']}&playlist_id=eq.{playlist['id']}&select=*"
        )
    )
    if not asg:
        sb.post(
            "/rest/v1/assignments",
            {
                "playlist_id": playlist["id"],
                "target_type": "group",
                "target_id": group["id"],
                "created_by": admin_id,
            },
            prefer="return=minimal",
        )
        print("created group assignment")
    else:
        print("assignment exists")

    # Headset membership
    headset = one_or_none(sb.get(f"/rest/v1/headsets?name=eq.{HEADSET_NAME}&select=*"))
    if not headset:
        die(f"headset {HEADSET_NAME} not found — pair staging headset first")
    mem = one_or_none(
        sb.get(
            f"/rest/v1/headset_group_members?group_id=eq.{group['id']}&headset_id=eq.{headset['id']}&select=*"
        )
    )
    if not mem:
        sb.post(
            "/rest/v1/headset_group_members",
            {"group_id": group["id"], "headset_id": headset["id"]},
            prefer="return=minimal",
        )
        print(f"added {HEADSET_NAME} to {GROUP_NAME}")
    else:
        print(f"{HEADSET_NAME} already in {GROUP_NAME}")

    # Refresh headset state
    h2 = sb.get(
        f"/rest/v1/headsets?id=eq.{headset['id']}&select=name,desired_manifest_version,applied_manifest_version,last_sync_status,status"
    )[0]
    print("HEADSET_STATE", json.dumps(h2))
    print("VIDEO_IDS", len(video_ids))
    print("PASS_SEED_STRUCTURE True")


if __name__ == "__main__":
    main()
