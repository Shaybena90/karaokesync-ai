// Minimal JSON DOM + parser (RFC 8259 subset sufficient for data files). No exceptions, no RTTI,
// so it is safe inside Unreal modules. UTF-8 is kept as-is; \uXXXX escapes are decoded to UTF-8.
#pragma once
#include <map>
#include <memory>
#include <string>
#include <vector>

namespace kanaf {

class JsonValue {
public:
    enum class Type { Null, Bool, Number, String, Array, Object };
    JsonValue() = default;
    static JsonValue makeBool(bool b) { JsonValue v; v.type_ = Type::Bool; v.b_ = b; return v; }
    static JsonValue makeNumber(double d) { JsonValue v; v.type_ = Type::Number; v.n_ = d; return v; }
    static JsonValue makeString(std::string s) { JsonValue v; v.type_ = Type::String; v.s_ = std::move(s); return v; }
    static JsonValue makeArray() { JsonValue v; v.type_ = Type::Array; return v; }
    static JsonValue makeObject() { JsonValue v; v.type_ = Type::Object; return v; }

    Type type() const { return type_; }
    bool isNull() const { return type_ == Type::Null; }
    bool isObject() const { return type_ == Type::Object; }
    bool isArray() const { return type_ == Type::Array; }
    bool isString() const { return type_ == Type::String; }
    bool isNumber() const { return type_ == Type::Number; }
    bool isBool() const { return type_ == Type::Bool; }

    // Accessors with defaults (never fail).
    double num(double def = 0) const { return type_ == Type::Number ? n_ : def; }
    bool boolean(bool def = false) const { return type_ == Type::Bool ? b_ : def; }
    const std::string& str() const { static const std::string e; return type_ == Type::String ? s_ : e; }
    std::string str(const std::string& def) const { return type_ == Type::String ? s_ : def; }

    const std::vector<JsonValue>& items() const { static const std::vector<JsonValue> e; return type_ == Type::Array ? arr_ : e; }
    const std::vector<std::pair<std::string, JsonValue>>& members() const {
        static const std::vector<std::pair<std::string, JsonValue>> e; return type_ == Type::Object ? obj_ : e;
    }
    bool has(const std::string& key) const;
    const JsonValue& operator[](const std::string& key) const;  // returns Null value if missing
    const JsonValue& operator[](size_t i) const;
    size_t size() const { return type_ == Type::Array ? arr_.size() : (type_ == Type::Object ? obj_.size() : 0); }

    // Builders
    void push(JsonValue v) { arr_.push_back(std::move(v)); }
    void set(const std::string& key, JsonValue v);

    std::vector<std::string> strings() const;  // array of strings helper

private:
    Type type_ = Type::Null;
    bool b_ = false;
    double n_ = 0;
    std::string s_;
    std::vector<JsonValue> arr_;
    std::vector<std::pair<std::string, JsonValue>> obj_;  // keeps file order
};

struct JsonParseResult {
    JsonValue value;
    bool ok = false;
    std::string error;   // "line:col: message"
};

JsonParseResult parseJson(const std::string& text);
bool readTextFile(const std::string& path, std::string& out);

}  // namespace kanaf
