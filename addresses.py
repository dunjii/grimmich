"""Addresses of a service (Immich, Gramps): up to three, with names, e.g. home network / Tailscale / online.

The .env file of the service contains:
    IMMICH_URL=...         first address (the field was always called that, old files keep working unchanged)
    IMMICH_URL_NAME=...    its name
    IMMICH_URL_2=..., IMMICH_URL_2_NAME=..., IMMICH_URL_3=..., IMMICH_URL_3_NAME=...
    IMMICH_AUTO=1|0        1: take the first reachable address (default for Immich), 0: choose by hand (default for Gramps)
    IMMICH_ACTIVE=1|2|3     when by hand: which address applies
Grimmich only switches automatically between the addresses of ONE service. That is only right if they all lead to the
same server (not for Gramps if one address is a test copy). That is why it is off by default for Gramps.
"""
import threading
import time
import urllib.error
import urllib.request

PREFIX = {"immich": "IMMICH", "gramps": "GRAMPS"}
DEFAULT_AUTO = {"immich": True, "gramps": False}
DEFAULT_NAMES = ("Adresse 1", "Adresse 2", "Adresse 3")
_remember = {}          # (addresses) -> (time, name, url)
_lock_ = threading.Lock()
MEMO_TIME = 30        # seconds, how long a check result applies
TIMEOUT = 1.5


def _key(service, no, name=False):
    p = PREFIX[service]
    basis = f"{p}_URL" if no == 1 else f"{p}_URL_{no}"
    return basis + ("_NAME" if name else "")


def items_list(values_, service):
    """-> [(nr, name, url)] of the entered addresses, in order."""
    out_ = []
    for no in (1, 2, 3):
        url = (values_.get(_key(service, no)) or "").strip().rstrip("/")
        if url:
            out_.append((no, (values_.get(_key(service, no, True)) or "").strip() or DEFAULT_NAMES[no - 1], url))
    return out_


def automatic(values_, service):
    w = values_.get(PREFIX[service] + "_AUTO")
    return DEFAULT_AUTO[service] if w not in ("0", "1") else w == "1"


def active_no(values_, service):
    w = values_.get(PREFIX[service] + "_ACTIVE", "1")
    return int(w) if w in ("1", "2", "3") else 1


def reachable(url, timeout=TIMEOUT):
    """Does any server answer at the address? (Even 401/404 counts: then it is there.)"""
    try:
        urllib.request.urlopen(urllib.request.Request(url, method="GET"), timeout=timeout)
        return True
    except urllib.error.HTTPError:
        return True
    except (OSError, ValueError):
        return False


def choose(values_, service, verify=reachable, fresh=False):
    """-> (name, url) of the address that applies now, or ("", "") if none is entered.
    Automatic: the first reachable one, otherwise the first. By hand: the chosen one (otherwise the first)."""
    addr = items_list(values_, service)
    if not addr:
        return "", ""
    if len(addr) == 1:
        return addr[0][1], addr[0][2]
    if not automatic(values_, service):
        no = active_no(values_, service)
        for n, name, url in addr:
            if n == no:
                return name, url
        return addr[0][1], addr[0][2]
    key = tuple(a[2] for a in addr)
    with _lock_:
        t = _remember.get(key)
        if t and not fresh and time.time() - t[0] < MEMO_TIME:
            return t[1], t[2]
    result = {}

    def test_it(n, url):
        result[n] = verify(url)
    threads = [threading.Thread(target=test_it, args=(n, u), daemon=True) for n, _, u in addr]
    for t in threads:
        t.start()
    for t in threads:
        t.join(TIMEOUT + 1)
    choice = next(((name, url) for n, name, url in addr if result.get(n)), (addr[0][1], addr[0][2]))   # none reachable: the first one, then the normal error message comes
    with _lock_:
        _remember[key] = (time.time(), choice[0], choice[1])
    return choice


def url(values_, service, **kw):
    return choose(values_, service, **kw)[1]


def forget_it():
    with _lock_:
        _remember.clear()
