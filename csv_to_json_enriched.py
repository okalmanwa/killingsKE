#!/usr/bin/env python3
"""
CSV -> JSON (Kenya-focused enrichment)

- Infers County from Location and Description
- Extracts Year and Month from date fields
- Emits JSONL (one object per line) and JSON array

Usage:
  python csv_to_json_enriched.py --in missing_voices.csv --out missing_voices.jsonl

Requires: pandas (optional), but this version uses only stdlib.
"""

import argparse
import csv
import json
import re
from datetime import datetime
from pathlib import Path

# ---- Kenyan counties & a few common city->county hints ----
KENYA_COUNTIES = {
    "Baringo","Bomet","Bungoma","Busia","Elgeyo Marakwet","Embu","Garissa","Homa Bay","Isiolo",
    "Kajiado","Kakamega","Kericho","Kiambu","Kilifi","Kirinyaga","Kisii","Kisumu","Kitui","Kwale",
    "Laikipia","Lamu","Machakos","Makueni","Mandera","Marsabit","Meru","Migori","Mombasa","Murang'a",
    "Nairobi","Nakuru","Nandi","Narok","Nyamira","Nyandarua","Nyeri","Samburu","Siaya","Taita-Taveta",
    "Tana River","Tharaka-Nithi","Trans Nzoia","Turkana","Uasin Gishu","Vihiga","Wajir","West Pokot"
}
# normalize variants we often see
ALIAS_TO_COUNTY = {
    "homa bay": "Homa Bay",
    "homa-bay": "Homa Bay",
    "homabay": "Homa Bay",
    "elgeyo marakwet": "Elgeyo Marakwet",
    "taita taveta": "Taita-Taveta",
    "taita-taveta": "Taita-Taveta",
    "tharaka nithi": "Tharaka-Nithi",
    "tharaka-nithi": "Tharaka-Nithi",
    "nairobi county": "Nairobi",
    "mombasa county": "Mombasa",
    "kisumu county": "Kisumu",
    "nakuru county": "Nakuru",
    "meru county": "Meru",
    "kajiado county": "Kajiado",
    "lamu county": "Lamu",
    "narok county": "Narok",
    "kisii county": "Kisii",
    "kakamega county": "Kakamega",
    "eldoret": "Uasin Gishu",       # town → county
    "rongai": "Kajiado",            # Ongata Rongai (Kajiado County)
    "ongata rongai": "Kajiado",
    "mathare": "Nairobi",
    "eastleigh": "Nairobi",
    "kawangware": "Nairobi",
    "cbd": "Nairobi",
    "gigiri": "Nairobi",
    "mwiki": "Nairobi",
    "kisii": "Kisii",
    "kisumu": "Kisumu",
    "nakuru": "Nakuru",
    "homabay": "Homa Bay",
    "elgeyo": "Elgeyo Marakwet",
    "baringo": "Baringo",
    "bomet": "Bomet",
    "busia": "Busia",
    "embu": "Embu",
    "garissa": "Garissa",
    "isiolo": "Isiolo",
    "kilifi": "Kilifi",
    "kirinyaga": "Kirinyaga",
    "kitui": "Kitui",
    "kwale": "Kwale",
    "laikipia": "Laikipia",
    "machakos": "Machakos",
    "makueni": "Makueni",
    "mandera": "Mandera",
    "marsabit": "Marsabit",
    "migori": "Migori",
    "murang'a": "Murang'a",
    "nyamira": "Nyamira",
    "nyandarua": "Nyandarua",
    "nyeri": "Nyeri",
    "samburu": "Samburu",
    "siaya": "Siaya",
    "tana river": "Tana River",
    "tharaka": "Tharaka-Nithi",
    "trans nzoia": "Trans Nzoia",
    "turkana": "Turkana",
    "nandi": "Nandi",
    "vihiga": "Vihiga",
    "wajir": "Wajir",
    "west pokot": "West Pokot",
    "ukwala": "Siaya"               # town in Siaya County
}

MONTHS = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12
}
MONTH_NUM_TO_NAME = {v: k.title() for k, v in MONTHS.items()}

def normalize_text(s: str) -> str:
    return re.sub(r"\s+", " ", s or "").strip()

def find_county(*texts: str) -> str | None:
    """
    Try to find a Kenyan county from any of the given texts.
    Strategy:
      1) direct match of full county name (case-insensitive, with/without 'County')
      2) alias/keyword match in ALIAS_TO_COUNTY
    """
    joined = " ".join([t for t in texts if t]).lower()
    # exact county names
    for c in KENYA_COUNTIES:
        c_l = c.lower()
        if re.search(rf"\b{re.escape(c_l)}\b", joined):
            return c
        if re.search(rf"\b{re.escape(c_l)}\s+county\b", joined):
            return c
    # aliases/keywords
    for alias, county in ALIAS_TO_COUNTY.items():
        if re.search(rf"\b{re.escape(alias)}\b", joined):
            return county
    return None

def parse_year_month(date_iso: str | None, date_text: str | None) -> tuple[int | None, str | None]:
    """
    Extract Year and Month (Month written, e.g. 'June') from either ISO or text.
    """
    # 1) ISO: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:mm:ssZ'
    if date_iso:
        try:
            # handle trailing Z
            iso = date_iso.replace("Z", "+00:00")
            dt = datetime.fromisoformat(iso)
            return dt.year, MONTH_NUM_TO_NAME.get(dt.month)
        except Exception:
            pass

    # 2) Text like "20 June, 2025" or "February 2023"
    t = normalize_text((date_text or "").replace(",", " "))
    # Try formats with day first
    for fmt in ("%d %B %Y", "%d %b %Y"):
        try:
            dt = datetime.strptime(t, fmt)
            return dt.year, MONTH_NUM_TO_NAME.get(dt.month)
        except Exception:
            continue
    # Try "Month YYYY"
    m = re.search(r"\b([A-Za-z]+)\s+(\d{4})\b", t)
    if m:
        mon_name = m.group(1).lower()
        yr = int(m.group(2))
        if mon_name in MONTHS:
            return yr, MONTH_NUM_TO_NAME[MONTHS[mon_name]]

    # Try "YYYY-MM" or "YYYY/MM"
    m2 = re.search(r"\b(\d{4})[-/](\d{1,2})\b", t)
    if m2:
        yr = int(m2.group(1))
        mon = int(m2.group(2))
        if 1 <= mon <= 12:
            return yr, MONTH_NUM_TO_NAME[mon]

    return None, None

def row_to_json(record: dict) -> dict:
    """
    Convert a CSV dict row into the target JSON schema.
    Falls back to 'Unknown' for missing optional fields you want in the output.
    """
    name = normalize_text(record.get("name") or record.get("Name") or "")
    sex = normalize_text(record.get("sex") or record.get("Sex") or "")
    location = normalize_text(record.get("location") or record.get("Location") or "")
    manner = normalize_text(
        record.get("manner_of_death") or record.get("Manner of Death") or ""
    )
    description = normalize_text(
        record.get("detail_description") or record.get("Description") or ""
    )

    date_iso = record.get("date_of_incident_iso")
    date_text = record.get("date_of_incident_text") or record.get("Date of Incident")

    year, month = parse_year_month(date_iso, date_text)
    county = find_county(location, description)

    # Optional fields not in the CSV — expose them but default to "Unknown"
    perpetrator = normalize_text(record.get("Perpetrator") or "Unknown")
    status = normalize_text(record.get("Status of Case") or "Unknown")
    occupation = normalize_text(record.get("Occupation") or "Unknown")

    # Prefer human-readable date if it exists; keep original text as "Date of Incident"
    date_out = (
        normalize_text(date_text)
        if date_text
        else (date_iso[:10] if date_iso else "")
    )

    return {
        "Sex": sex or "Unknown",
        "Location": location or "Unknown",
        "Manner of Death": manner or "Unknown",
        "Perpetrator": perpetrator or "Unknown",
        "Status of Case": status or "Unknown",
        "Date of Incident": date_out or "Unknown",
        "Occupation": occupation or "Unknown",
        "Description": description or "",
        "Name": name or "Unknown",
        # Enriched fields:
        "County": county or "Unknown",
        "Year": year if year is not None else "Unknown",
        "Month": month if month is not None else "Unknown",
    }

def convert_csv(in_path: Path, out_jsonl: Path, out_json: Path | None = None) -> None:
    out_jsonl.parent.mkdir(parents=True, exist_ok=True)
    items = []
    with in_path.open("r", encoding="utf-8") as f, out_jsonl.open("w", encoding="utf-8") as out:
        reader = csv.DictReader(f)
        for row in reader:
            obj = row_to_json(row)
            items.append(obj)
            out.write(json.dumps(obj, ensure_ascii=False) + "\n")
    if out_json:
        with out_json.open("w", encoding="utf-8") as jf:
            json.dump(items, jf, ensure_ascii=False, indent=2)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="in_file", required=True, help="Input CSV (from scraper)")
    ap.add_argument("--out", dest="out_jsonl", default="missing_voices.jsonl", help="Output JSONL")
    ap.add_argument("--out-json", dest="out_json", default="missing_voices.json", help="Also write JSON array")
    args = ap.parse_args()

    in_path = Path(args.in_file)
    out_jsonl = Path(args.out_jsonl)
    out_json = Path(args.out_json)

    convert_csv(in_path, out_jsonl, out_json)
    print(f"✓ Wrote {out_jsonl} and {out_json}")

if __name__ == "__main__":
    main()
