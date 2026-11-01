"""Calculation rules for dating (standard library only, fast).

Used together by estimate.py, the interface (datierung2_gui.py) and later by the
write script, so that the same result comes out everywhere.
"""
import math
from collections import defaultdict
from datetime import date

# systematic minimum error (years) that is added to the spread in the
# stated span. Calibrated on the known years.
SYSTEM_ERROR = 3.5
SERIES_DIFFERENCE = 8  # years: how far apart the single estimates of a series may be
CORRELATION = 0.5       # the same person on several photos of the series counts only partly as new information


def decimal_year_value(text):
    """'1938-07-01' -> 1938.5 ; None bei unlesbarem Datum."""
    try:
        d = date.fromisoformat(str(text)[:10])
    except ValueError:
        return None
    return d.year + (d.timetuple().tm_yday - 1) / 365.25


def sigma(age_value):
    """Rough assumption about the uncertainty (in years) depending on the estimated age.

    Not yet calibrated on your photos - we do that with the known years.
    """
    if age_value < 6:
        return 1.2
    if age_value < 12:
        return 1.8
    if age_value < 20:
        return 2.5
    if age_value < 35:
        return 3.5
    if age_value < 55:
        return 5.0
    return 6.5


def _mean(values_):
    """Weighted mean of the years (weight 1/sigma^2) and its uncertainty."""
    weights = [1 / w["sigma"] ** 2 for w in values_]
    total_sum = sum(weights)
    year_num = sum(g * w["year"] for g, w in zip(weights, values_)) / total_sum
    return year_num, 1 / math.sqrt(total_sum)


def day_now():
    """Decimal year of today. No photo can have been taken later."""
    return decimal_year_value(date.today().isoformat())


def _span(year_num, sig, values_):
    sig = math.sqrt(sig ** 2 + SYSTEM_ERROR ** 2)
    from_ = max(year_num - 1.5 * sig, max(w["birth"] for w in values_))  # never before the birth
    to_ = max(year_num + 1.5 * sig, from_)
    now_ = date.today().year
    return min(math.floor(from_), now_), min(math.ceil(to_), now_)   # never after today


def order_violated(values_):
    """Does the estimated age order not fit the known birth dates?"""
    for a in range(len(values_)):
        for b in range(a + 1, len(values_)):
            x, y = values_[a], values_[b]
            distance = abs(x["birth"] - y["birth"])
            if distance < 2:
                continue
            younger, older_than = (x, y) if x["birth"] > y["birth"] else (y, x)
            diff = younger["age"] - older_than["age"]  # should be about -distance
            if diff <= 0.5:
                continue
            spread = math.sqrt(younger["sigma"] ** 2 + older_than["sigma"] ** 2)
            if (diff + distance) / spread > 1.5:
                return True
    return False


def find_outliers(values_):
    """The most deviating face together with the suggestion without it (or None)."""
    if len(values_) < 3:
        return None
    best_one = None
    for i, w in enumerate(values_):
        rest = values_[:i] + values_[i + 1:]
        j, s = _mean(rest)
        z = abs(w["year"] - j) / math.sqrt(w["sigma"] ** 2 + s ** 2)
        if best_one is None or z > best_one[0]:
            best_one = (z, i, j, s, rest)
    z, i, j, s, rest = best_one
    if z < 2.0:
        return None
    # the others must agree with each other
    if max(abs(r["year"] - j) / r["sigma"] for r in rest) > 2.5:
        return None
    from_, to_ = _span(j, s, rest)
    w = values_[i]
    return {
        "text": f"{w['name']} ({w['age']:.0f} J -> {w['year']:.0f})",
        "suggestion": f"{round(j)} ({from_}-{to_})",
    }


def combine(values_):
    """values: list of dicts (year, sigma, birth, age, name)."""
    year_num, sig = _mean(values_)
    from_, to_ = _span(year_num, sig, values_)
    future = year_num > day_now()
    if future:
        year_num = day_now()   # upper limit: no computed year after today
    maxz = max(abs(w["year"] - year_num) / w["sigma"] for w in values_)
    hints = ["Estimate lies in the future (limited to today)"] if future else []
    contradiction = False
    if len(values_) >= 2 and maxz > 2.5:
        hints.append("Faces contradict each other")
        contradiction = True
    if order_violated(values_):
        hints.append("Age order contradicts")
        contradiction = True
    if any(year_num < w["birth"] - 0.5 for w in values_):
        hints.append("Person would not have been born yet in the calculated year")
        contradiction = True
    if min(w["age"] for w in values_) > 45:
        hints.append("only older people: rough estimate")
    return {
        "year": year_num,
        "from": from_,
        "to": to_,
        "hint": "; ".join(hints),
        "outliers": find_outliers(values_) if contradiction else None,
    }


def combine_series(value_lists):
    """Combine all faces of all photos of a series into ONE date.

    The same person on several photos is averaged first; their uncertainty
    drops only partly (the errors are not independent)."""
    by_person = defaultdict(list)
    for ws in value_lists:
        for w in ws:
            by_person[w["name"]].append(w)
    total = []
    for name, ws in by_person.items():
        n = len(ws)
        age_value = sum(w["age"] for w in ws) / n
        total.append({
            "name": name,
            "birth": ws[0]["birth"],
            "age": age_value,
            "year": ws[0]["birth"] + age_value,
            "sigma": sigma(age_value) / math.sqrt(1 + CORRELATION * (n - 1)),
        })
    return combine(total), len(total)


def values_from_info(people_):
    """age_per_photo.json entry of a photo -> list of values as in estimate.py."""
    result = []
    for p in people_ or []:
        if p.get("age") is None or p.get("birth") is None:
            continue
        age_value = float(p["age"])
        result.append({"year": p["birth"] + age_value, "sigma": sigma(age_value), "birth": p["birth"],
                         "age": age_value, "name": p["name"]})
    return result


def series_result(keys, age_info):
    """Common date of a series (or None if no datable person is in it).

    -> {"year": float, "from": int, "to": int, "hint": str, "count": int}"""
    lists = [values_from_info(age_info.get(k)) for k in keys]
    lists = [w for w in lists if w]
    if not lists:
        return None
    res, amount = combine_series(lists)
    single_one = sorted(round(combine(w)["year"]) for w in lists)
    hints = [res["hint"]] if res["hint"] else []
    if single_one[-1] - single_one[0] > SERIES_DIFFERENCE:
        hints.append(f"Individual estimates in the series differ strongly ({single_one[0]}-{single_one[-1]})")
    return {"year": res["year"], "from": res["from"], "to": res["to"],
            "hint": "; ".join(hints), "count": amount}
