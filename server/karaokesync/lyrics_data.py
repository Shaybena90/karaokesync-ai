"""Loading a project's lyrics with the service role (callers check ownership)."""

from __future__ import annotations

from .supabase_client import SupabaseClient


def load_lyrics(sb: SupabaseClient, project_id: str) -> list[dict]:
    lines = sb.select(
        "lyric_lines",
        {"project_id": f"eq.{project_id}", "select": "id,line_index,start_ms,end_ms", "order": "line_index.asc"},
    )
    words = sb.select(
        "lyric_words",
        {"project_id": f"eq.{project_id}", "select": "line_id,text,start_ms,end_ms,word_index", "order": "word_index.asc"},
    )
    by_line: dict[str, list[dict]] = {}
    for w in words:
        by_line.setdefault(w["line_id"], []).append(w)
    out = []
    for line in sorted(lines, key=lambda l: l["line_index"]):
        ws = sorted(by_line.get(line["id"], []), key=lambda w: w["word_index"])
        if ws:
            out.append({"start_ms": ws[0]["start_ms"], "end_ms": max(w["end_ms"] for w in ws), "words": ws})
    return out
