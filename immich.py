"""Immich access: ONE shared client for all parts of Grimmich (estimate, state, write, Gramps ...).

Earlier every part of the program had its own copy of this code. Now there is only this one.
"""
import json
import urllib.error
import urllib.parse
import urllib.request


class ApiError(Exception):
    pass


class Immich:
    def __init__(self, url, key, timeout=60):
        self.url, self.key, self.timeout = str(url).rstrip("/"), key, timeout

    def request_(self, methode, path_, data_=None, params=None, raw=False, timeout=None):
        """One request to Immich. -> answer as Python data (with raw=True as bytes, e.g. for images).
        method=None: GET, or POST if data is sent along."""
        address = f"{self.url}/api{path_}"
        if params:
            address += "?" + urllib.parse.urlencode(params)
        head = {"x-api-key": self.key, "Accept": "*/*" if raw else "application/json"}
        body_part = None
        if data_ is not None:
            body_part = json.dumps(data_).encode("utf-8")
            head["Content-Type"] = "application/json"
        if methode is None:
            methode = "GET" if data_ is None else "POST"
        req = urllib.request.Request(address, data=body_part, headers=head, method=methode)
        try:
            with urllib.request.urlopen(req, timeout=timeout or self.timeout) as response:
                content = response.read()
        except urllib.error.HTTPError as e:
            text = e.read().decode("utf-8", "replace")[:300]
            raise ApiError(f"Fehler {e.code} bei {methode} {path_}: {text}")
        except urllib.error.URLError as e:
            raise ApiError(f"Keine Verbindung zu {self.url} ({e.reason})")
        except OSError as e:
            raise ApiError(f"Netzwerkfehler bei {path_}: {e}")
        if raw:
            return content
        return json.loads(content) if content.strip() else None
