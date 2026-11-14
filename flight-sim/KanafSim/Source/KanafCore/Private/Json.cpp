#include "Kanaf/Json.h"

#include <cstdio>
#include <cstdlib>

namespace kanaf {

bool JsonValue::has(const std::string& key) const {
    for (auto& m : members()) if (m.first == key) return true;
    return false;
}
const JsonValue& JsonValue::operator[](const std::string& key) const {
    static const JsonValue null;
    for (auto& m : members()) if (m.first == key) return m.second;
    return null;
}
const JsonValue& JsonValue::operator[](size_t i) const {
    static const JsonValue null;
    return (type_ == Type::Array && i < arr_.size()) ? arr_[i] : null;
}
void JsonValue::set(const std::string& key, JsonValue v) {
    for (auto& m : obj_) if (m.first == key) { m.second = std::move(v); return; }
    obj_.emplace_back(key, std::move(v));
}
std::vector<std::string> JsonValue::strings() const {
    std::vector<std::string> out;
    for (auto& i : items()) if (i.isString()) out.push_back(i.str());
    return out;
}

namespace {
struct Parser {
    const std::string& t;
    size_t p = 0;
    std::string err;
    explicit Parser(const std::string& text) : t(text) {}

    bool fail(const std::string& m) {
        if (err.empty()) {
            int line = 1, col = 1;
            for (size_t i = 0; i < p && i < t.size(); ++i) { if (t[i] == '\n') { ++line; col = 1; } else ++col; }
            err = std::to_string(line) + ":" + std::to_string(col) + ": " + m;
        }
        return false;
    }
    void ws() {
        while (p < t.size()) {
            char c = t[p];
            if (c == ' ' || c == '\n' || c == '\r' || c == '\t') ++p;
            else break;
        }
    }
    bool lit(const char* s) {
        size_t i = 0;
        while (s[i]) { if (p + i >= t.size() || t[p + i] != s[i]) return false; ++i; }
        p += i;
        return true;
    }
    static void utf8(std::string& o, unsigned cp) {
        if (cp < 0x80) o += char(cp);
        else if (cp < 0x800) { o += char(0xC0 | (cp >> 6)); o += char(0x80 | (cp & 0x3F)); }
        else if (cp < 0x10000) { o += char(0xE0 | (cp >> 12)); o += char(0x80 | ((cp >> 6) & 0x3F)); o += char(0x80 | (cp & 0x3F)); }
        else { o += char(0xF0 | (cp >> 18)); o += char(0x80 | ((cp >> 12) & 0x3F)); o += char(0x80 | ((cp >> 6) & 0x3F)); o += char(0x80 | (cp & 0x3F)); }
    }
    bool hex4(unsigned& v) {
        if (p + 4 > t.size()) return fail("bad \\u escape");
        v = 0;
        for (int i = 0; i < 4; ++i) {
            char c = t[p++];
            v <<= 4;
            if (c >= '0' && c <= '9') v |= unsigned(c - '0');
            else if (c >= 'a' && c <= 'f') v |= unsigned(c - 'a' + 10);
            else if (c >= 'A' && c <= 'F') v |= unsigned(c - 'A' + 10);
            else return fail("bad hex digit");
        }
        return true;
    }
    bool str(std::string& o) {
        if (t[p] != '"') return fail("expected string");
        ++p;
        while (p < t.size()) {
            char c = t[p++];
            if (c == '"') return true;
            if (c == '\\') {
                if (p >= t.size()) break;
                char e = t[p++];
                switch (e) {
                    case '"': o += '"'; break;
                    case '\\': o += '\\'; break;
                    case '/': o += '/'; break;
                    case 'b': o += '\b'; break;
                    case 'f': o += '\f'; break;
                    case 'n': o += '\n'; break;
                    case 'r': o += '\r'; break;
                    case 't': o += '\t'; break;
                    case 'u': {
                        unsigned cp;
                        if (!hex4(cp)) return false;
                        if (cp >= 0xD800 && cp < 0xDC00 && p + 1 < t.size() && t[p] == '\\' && t[p + 1] == 'u') {
                            p += 2;
                            unsigned lo;
                            if (!hex4(lo)) return false;
                            cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                        }
                        utf8(o, cp);
                        break;
                    }
                    default: return fail("bad escape");
                }
            } else {
                o += c;
            }
        }
        return fail("unterminated string");
    }
    bool value(JsonValue& out, int depth) {
        if (depth > 64) return fail("nesting too deep");
        ws();
        if (p >= t.size()) return fail("unexpected end");
        char c = t[p];
        if (c == '{') {
            ++p;
            out = JsonValue::makeObject();
            ws();
            if (p < t.size() && t[p] == '}') { ++p; return true; }
            while (true) {
                ws();
                std::string k;
                if (p >= t.size() || !str(k)) return fail("expected key");
                ws();
                if (p >= t.size() || t[p] != ':') return fail("expected ':'");
                ++p;
                JsonValue v;
                if (!value(v, depth + 1)) return false;
                out.set(k, std::move(v));
                ws();
                if (p < t.size() && t[p] == ',') { ++p; continue; }
                if (p < t.size() && t[p] == '}') { ++p; return true; }
                return fail("expected ',' or '}'");
            }
        }
        if (c == '[') {
            ++p;
            out = JsonValue::makeArray();
            ws();
            if (p < t.size() && t[p] == ']') { ++p; return true; }
            while (true) {
                JsonValue v;
                if (!value(v, depth + 1)) return false;
                out.push(std::move(v));
                ws();
                if (p < t.size() && t[p] == ',') { ++p; continue; }
                if (p < t.size() && t[p] == ']') { ++p; return true; }
                return fail("expected ',' or ']'");
            }
        }
        if (c == '"') { std::string s; if (!str(s)) return false; out = JsonValue::makeString(std::move(s)); return true; }
        if (lit("true")) { out = JsonValue::makeBool(true); return true; }
        if (lit("false")) { out = JsonValue::makeBool(false); return true; }
        if (lit("null")) { out = JsonValue(); return true; }
        if (c == '-' || (c >= '0' && c <= '9')) {
            size_t s = p;
            if (t[p] == '-') ++p;
            while (p < t.size() && ((t[p] >= '0' && t[p] <= '9') || t[p] == '.' || t[p] == 'e' || t[p] == 'E' || t[p] == '+' || t[p] == '-')) ++p;
            std::string num = t.substr(s, p - s);
            char* end = nullptr;
            double d = std::strtod(num.c_str(), &end);
            if (!end || *end != 0) return fail("bad number");
            out = JsonValue::makeNumber(d);
            return true;
        }
        return fail("unexpected character");
    }
};
}  // namespace

JsonParseResult parseJson(const std::string& text) {
    JsonParseResult r;
    Parser ps(text);
    // skip UTF-8 BOM
    if (text.size() >= 3 && (unsigned char)text[0] == 0xEF && (unsigned char)text[1] == 0xBB && (unsigned char)text[2] == 0xBF) ps.p = 3;
    if (ps.value(r.value, 0)) {
        ps.ws();
        if (ps.p != text.size()) ps.fail("trailing characters");
    }
    r.ok = ps.err.empty();
    r.error = ps.err;
    if (!r.ok) r.value = JsonValue();
    return r;
}

bool readTextFile(const std::string& path, std::string& out) {
    FILE* f = std::fopen(path.c_str(), "rb");
    if (!f) return false;
    out.clear();
    char buf[65536];
    size_t n;
    while ((n = std::fread(buf, 1, sizeof buf, f)) > 0) out.append(buf, n);
    std::fclose(f);
    return true;
}

}  // namespace kanaf
