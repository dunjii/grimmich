"""Which access file applies for writing?

Default: one access per service (Immich key, Gramps user) for reading AND writing.
Whoever wants to keep them apart (one key/user for reading only, a second for writing) switches that
on in the settings. Grimmich remembers this in the read file (SEPARATE_WRITE=1).
Existing write accesses are kept; for older installations "separate" applies as long as they exist.
"""
import os

import migration

migration.migrate_env()   # older installations: new file and variable names (once)

READ_ENV_NAME = {"immich": "immich.env", "gramps": "gramps.env"}
WRITE_CONST = {"immich": "immich_write.env", "gramps": "gramps_write.env"}


def _values(file_path):
    w = {}
    try:
        with open(file_path, encoding="utf-8") as f:
            for z in f:
                z = z.strip()
                if z and not z.startswith("#") and "=" in z:
                    k, v = z.split("=", 1)
                    w[k.strip()] = v.strip()
    except OSError:
        pass
    return w


def separate(service):
    flag = _values(READ_ENV_NAME[service]).get("SEPARATE_WRITE")
    if flag in ("0", "1"):
        return flag == "1"
    return os.path.exists(WRITE_CONST[service])   # old installation without a marker


def write_env_name(service):
    """Path of the file that is read for writing."""
    return WRITE_CONST[service] if separate(service) else READ_ENV_NAME[service]
