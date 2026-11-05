"""The three AI models and the exact version of each one that Grimmich is tested with.

The models are not part of Grimmich: each installation downloads them once (into the data folder) and then uses them from there.
Because every model is asked for by its fixed version (a commit of its Hugging Face page), nothing asks the internet again and nothing
can change behind your back. "Check for new versions" (settings) compares these versions with the newest ones; it never changes anything.
To take a newer version: change the revision here, test, and rebuild."""
import datetime

MODELS = [
    {"key": "mivolo", "name": "MiVOLO v2", "use": "age estimation", "repo": "iitolstykh/mivolo_v2",
     "revision": "e8bdd8aec21ae468cbfe73b41f52550105ad8fbf", "license": "CC BY-NC 4.0"},
    {"key": "detector", "name": "YOLO Face & Person Detector", "use": "finding faces and people", "repo": "iitolstykh/YOLO-Face-Person-Detector",
     "revision": "b3d071aedccd46a3b2d4b40609da6880a815f395", "license": "AGPL-3.0"},
    {"key": "dinov2", "name": "DINOv2 small", "use": "image comparison for series", "repo": "facebook/dinov2-small",
     "revision": "ed25f3a31f01632728cabb09d1542f84ab7b0056", "license": "Apache-2.0"},
]


def revision(key):
    """The fixed version of one model (used when loading it)."""
    return next(m["revision"] for m in MODELS if m["key"] == key)


def newest(repo):
    """The newest version of a model on Hugging Face (one small request). Raises on a network problem."""
    from huggingface_hub import HfApi
    return HfApi().model_info(repo, timeout=20).sha


def check(find=None, now=None):
    """Asks for the newest version of each model. -> {"checked": time, "models": {key: {"latest": sha or "", "new": bool, "error": text}}}"""
    find = find or newest
    out = {}
    for m in MODELS:
        try:
            latest = find(m["repo"]) or ""
            out[m["key"]] = {"latest": latest, "new": bool(latest) and latest != m["revision"], "error": ""}
        except Exception as e:   # no connection, Hugging Face down, ...
            out[m["key"]] = {"latest": "", "new": False, "error": str(e)[:200]}
    return {"checked": (now or datetime.datetime.now()).isoformat(timespec="seconds"), "models": out}


def view(last):
    """What the settings page shows: the models with their fixed version and, from the last check, whether there is a newer one."""
    last = last if isinstance(last, dict) else {}
    found = last.get("models") if isinstance(last.get("models"), dict) else {}
    return {"ok": True, "checked": last.get("checked", ""), "models": [
        {**m, "latest": (found.get(m["key"]) or {}).get("latest", ""), "new": bool((found.get(m["key"]) or {}).get("new")),
         "error": (found.get(m["key"]) or {}).get("error", "")} for m in MODELS]}
