#!/usr/bin/env python3
"""Fetch reference results from the official ESTV tax calculator
(swisstaxcalculator.estv.admin.ch) and store them as test fixtures.

The calculator takes *taxable* income/wealth, so these fixtures check the
tariffs, family quotient, multipliers, church and personal tax — i.e.
everything after deductions. Re-run for a new year:  python3 tools/estv_fixtures.py 2026
"""
import json
import sys
import urllib.request

YEAR = int(sys.argv[1]) if len(sys.argv) > 1 else 2025
API = "https://swisstaxcalculator.estv.admin.ch/delegate/ost-integration/v1/lg-proxy/operation/c3b67379_ESTV/API_calculateSimpleTaxes"
# ESTV codes: Relationship 1 single (with children = single-parent household), 2 married, 3 unmarried couple;
# Confession 1 reformed, 2 catholic, 3 christ-catholic, 5 none.
LOCATIONS = {"VD": (100000000, "Lausanne"), "ZH": (800000000, "Zürich")}
CONFESSION = {"none": 5, "reformed": 1, "catholic": 2, "christCatholic": 3}

CASES = []
for canton in ("VD", "ZH"):
    for income in (20700, 48200, 80000, 150000, 400000, 1000000):
        CASES.append(dict(canton=canton, married=False, kids=0, income=income, wealth=0))
    for income in (60000, 100000, 250000):
        for kids in (0, 2):
            CASES.append(dict(canton=canton, married=True, kids=kids, income=income, wealth=0))
    for income in (100000, 300000):
        CASES.append(dict(canton=canton, married=False, kids=1, income=income, wealth=0))
    for wealth in (100000, 500000, 2000000, 5000000):
        CASES.append(dict(canton=canton, married=False, kids=0, income=80000, wealth=wealth))
        CASES.append(dict(canton=canton, married=True, kids=0, income=120000, wealth=wealth))
    CASES.append(dict(canton=canton, married=False, kids=0, income=80000, wealth=500000, confession="reformed"))
    CASES.append(dict(canton=canton, married=True, kids=1, income=120000, wealth=300000, confession="catholic"))


def call(case):
    loc, _ = LOCATIONS[case["canton"]]
    conf = CONFESSION[case.get("confession", "none")]
    body = {
        "SimKey": None,
        "TaxYear": YEAR,
        "TaxLocationID": loc,
        "Relationship": 2 if case["married"] else 1,
        "Confession1": conf,
        "Confession2": conf if case["married"] else 0,
        "Children": [{"Age": 9}] * case["kids"],
        "TaxableIncomeCanton": case["income"],
        "TaxableIncomeFed": case["income"],
        "TaxableFortune": case["wealth"],
    }
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers={"content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)["response"]


out = []
for c in CASES:
    r = call(c)
    out.append({**c, "commune": LOCATIONS[c["canton"]][1], "expected": {k: v for k, v in r.items() if k != "Location"}})
    print(c, "→", r["TotalTax"])

path = f"src/shared/data/estv-fixtures-{YEAR}.json"
with open(path, "w", encoding="utf-8") as f:
    json.dump({"source": API, "year": YEAR, "cases": out}, f, ensure_ascii=False, indent=1)
print("wrote", len(out), "cases to", path)
