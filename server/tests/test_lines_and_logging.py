from karaokesync.logging_setup import redact
from karaokesync.worker.lines import Word, clean_words, lines_to_payload, split_into_lines


def w(text, start, end, seg=0, conf=0.9):
    return Word(text=text, start_ms=start, end_ms=end, confidence=conf, segment_index=seg)


def test_clean_words_fixes_order_and_empties():
    words = clean_words([w(" שלום ", 100, 300), w("  ", 300, 400), w("עולם", 250, 200), w("x", 500, 600, conf=1.7)])
    assert [x.text for x in words] == ["שלום", "עולם", "x"]
    assert words[1].start_ms == 250 and words[1].end_ms == 250  # end never before start
    assert words[2].confidence == 1.0


def test_split_on_long_gap():
    lines = split_into_lines([w("a", 0, 100), w("b", 150, 200), w("c", 2000, 2100)])
    assert [[x.text for x in line.words] for line in lines] == [["a", "b"], ["c"]]


def test_split_on_max_words_and_chars():
    words = [w(f"w{i}", i * 100, i * 100 + 90) for i in range(20)]
    lines = split_into_lines(words, max_words=8, max_chars=1000)
    assert [len(line.words) for line in lines] == [8, 8, 4]
    long_words = [w("מילה" * 3, i * 100, i * 100 + 90) for i in range(6)]
    for line in split_into_lines(long_words, max_chars=32):
        assert line.char_count <= 32


def test_split_on_sentence_end_and_segments():
    words = [w("one", 0, 10), w("two", 20, 30), w("three.", 40, 50), w("four", 60, 70)]
    assert len(split_into_lines(words)) == 2
    seg = [w("a", 0, 10, 0), w("b", 20, 30, 0), w("c", 40, 50, 1)]
    assert len(split_into_lines(seg)) == 2


def test_payload_shape():
    payload = lines_to_payload(split_into_lines([w("hi", 10, 20)]), "en")
    assert payload == {"language": "en", "lines": [
        {"start_ms": 10, "end_ms": 20, "words": [{"text": "hi", "start_ms": 10, "end_ms": 20, "confidence": 0.9}]}
    ]}


def test_log_redaction():
    jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk"
    text = f"GET https://x.supabase.co/object/sign/a.mp3?token={jwt}&x=1 Authorization: Bearer abc.def sb_secret_abc123"
    out = redact(text)
    assert jwt not in out and "abc.def" not in out and "sb_secret_abc123" not in out
    assert "token=[REDACTED]" in out
