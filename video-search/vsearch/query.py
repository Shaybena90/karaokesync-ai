"""Turn a free Hebrew (or English) request into editable search fields.

Rule-based on purpose: the result is shown to the user as fields they can correct before running.
"רכב פרטי" is read as "passenger car" — ownership cannot be inferred from an image.
"""
from __future__ import annotations

import re

from .attributes import COLORS_HE
from .detection import TYPES_HE, VEHICLE_TYPES

MAKES = {
    "Kia": ["קיה", "קיא", "kia"],
    "Hyundai": ["יונדאי", "יונדיי", "hyundai"],
    "Toyota": ["טויוטה", "toyota"],
    "Mazda": ["מאזדה", "מזדה", "mazda"],
    "Skoda": ["סקודה", "skoda", "škoda"],
    "Suzuki": ["סוזוקי", "suzuki"],
    "Mitsubishi": ["מיצובישי", "mitsubishi"],
    "Nissan": ["ניסאן", "ניסן", "nissan"],
    "Honda": ["הונדה", "honda"],
    "Chevrolet": ["שברולט", "chevrolet"],
    "Ford": ["פורד", "ford"],
    "Volkswagen": ["פולקסווגן", "פולקסוואגן", "volkswagen", "vw"],
    "Seat": ["סיאט", "seat"],
    "Renault": ["רנו", "renault"],
    "Peugeot": ["פיג׳ו", "פיגו", "פג'ו", "פיג'ו", "peugeot"],
    "Citroen": ["סיטרואן", "citroen"],
    "Subaru": ["סובארו", "subaru"],
    "Tesla": ["טסלה", "tesla"],
    "BMW": ["ב.מ.וו", "במוו", "bmw"],
    "Mercedes-Benz": ["מרצדס", "mercedes"],
    "Audi": ["אאודי", "אודי", "audi"],
    "Volvo": ["וולוו", "volvo"],
    "Lexus": ["לקסוס", "lexus"],
    "Jeep": ["ג׳יפ", "ג'יפ", "jeep"],
    "MG": ["אם ג׳י", "אם ג'י", "mg"],
    "Geely": ["ג׳ילי", "ג'ילי", "geely"],
    "BYD": ["בי ווי די", "byd"],
    "Chery": ["צ׳רי", "צ'רי", "chery"],
    "Dacia": ["דאצ׳יה", "דאציה", "דצ'יה", "dacia"],
    "Opel": ["אופל", "opel"],
    "Fiat": ["פיאט", "fiat"],
}

COLOR_WORDS = {
    "white": ["לבן", "לבנה", "לבנים", "לבנות", "white"],
    "black": ["שחור", "שחורה", "שחורים", "שחורות", "black"],
    "gray": ["אפור", "אפורה", "אפורים", "אפורות", "כסוף", "כסופה", "כסופים", "כסופות", "gray", "grey", "silver"],
    "red": ["אדום", "אדומה", "אדומים", "אדומות", "בורדו", "red"],
    "orange": ["כתום", "כתומה", "כתומים", "כתומות", "orange"],
    "yellow": ["צהוב", "צהובה", "צהובים", "צהובות", "yellow"],
    "green": ["ירוק", "ירוקה", "ירוקים", "ירוקות", "green"],
    "blue": ["כחול", "כחולה", "כחולים", "כחולות", "תכלת", "blue"],
    "brown": ["חום", "חומה", "חומים", "בז׳", "בז'", "brown", "beige"],
}

TYPE_PATTERNS = [  # order matters: more specific first
    ("passenger_car", ["רכב פרטי", "רכבים פרטיים", "רכב נוסעים", "רכבי נוסעים", "מכונית", "מכוניות", "car", "cars"]),
    ("truck", ["משאית", "משאיות", "טנדר", "טנדרים", "truck", "pickup"]),
    ("bus", ["אוטובוס", "אוטובוסים", "bus"]),
    ("motorcycle", ["אופנוע", "אופנועים", "קטנוע", "קטנועים", "motorcycle", "scooter"]),
    ("bicycle", ["אופניים", "bicycle", "bike"]),
    ("person", ["אדם", "אנשים", "הולך רגל", "הולכי רגל", "אישה", "גבר", "person", "people", "pedestrian"]),
]
GENERIC_VEHICLE = ["רכב", "רכבים", "רכבי", "vehicle", "vehicles"]

# Hebrew prefixes that can be glued to a word: ו ה ב ל מ ש כ
_PREFIX = r"(?:^|(?<=[\s,.;:!?()\"'״׳-]))[והבלמשכ]{0,2}"


def _has(text: str, word: str) -> bool:
    w = re.escape(word.lower())
    if re.search(r"[a-z]", word.lower()):
        return re.search(rf"\b{w}\b", text) is not None
    return re.search(rf"{_PREFIX}{w}(?=$|[\s,.;:!?()\"'״׳-])", text) is not None


def parse_query(text: str) -> dict:
    t = " " + (text or "").lower().replace("׳", "׳") + " "
    notes: list[str] = []

    types: list[str] = []
    for tid, words in TYPE_PATTERNS:
        if any(_has(t, w) for w in words):
            types.append(tid)
    if _has(t, "רכב פרטי") or _has(t, "רכבים פרטיים"):
        notes.append("״רכב פרטי״ פורש כרכב נוסעים. לא ניתן להסיק מהתמונה אם הבעלות פרטית.")

    makes = [m for m, words in MAKES.items() if any(_has(t, w) for w in words)]
    # "רכבי קיה" → a make implies vehicles even without the word "car"
    if not types and (makes or any(_has(t, w) for w in GENERIC_VEHICLE)):
        types = ["passenger_car"] if makes else list(VEHICLE_TYPES)
        if makes:
            notes.append("לא צוין סוג רכב; הונח רכב נוסעים כי צוין יצרן. אפשר לשנות.")

    colors = [c for c, words in COLOR_WORDS.items() if any(_has(t, w) for w in words)]
    if "person" in types and makes:
        notes.append("יצרן רלוונטי לרכבים בלבד.")
    if not types:
        notes.append("לא זוהה סוג אובייקט בבקשה; יש לבחור סוג.")
    if len(colors) > 1:
        notes.append("זוהו כמה צבעים; התוצאה תכלול כל אחד מהם.")

    return {
        "text": text,
        "types": types,
        "colors": colors,
        "makes": makes,
        "labels": {
            "types": [TYPES_HE[x] for x in types],
            "colors": [COLORS_HE[x] for x in colors],
            "makes": makes,
        },
        "notes": notes,
        "parser": "rules-he-0.1",
    }


def normalize_fields(d: dict) -> dict:
    """Validate user-edited fields."""
    types = [x for x in d.get("types", []) if x in TYPES_HE]
    colors = [x for x in d.get("colors", []) if x in COLORS_HE]
    makes = [str(x).strip() for x in d.get("makes", []) if str(x).strip()]
    return {"types": types, "colors": colors, "makes": makes, "text": d.get("text", "")}
