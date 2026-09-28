use serde_json::{Map, Value};

pub fn parse(block: &str) -> Option<(String, Value)> {
    json(block).or_else(|| xml(block))
}

fn json(block: &str) -> Option<(String, Value)> {
    let value: Value = serde_json::from_str(block.trim()).ok()?;
    let name = value["name"].as_str()?.to_string();
    let arguments = match &value["arguments"] {
        Value::String(text) => serde_json::from_str(text).ok()?,
        Value::Null => Value::Object(Map::new()),
        other => other.clone(),
    };
    Some((name, arguments))
}

fn xml(block: &str) -> Option<(String, Value)> {
    let start = block.find("<function=")? + "<function=".len();
    let end = start + block[start..].find('>')?;
    let name = block[start..end].trim().to_string();
    let mut arguments = Map::new();
    let mut rest = &block[end..];
    while let Some(open) = rest.find("<parameter=") {
        let key_start = open + "<parameter=".len();
        let key_end = key_start + rest[key_start..].find('>')?;
        let key = rest[key_start..key_end].trim().to_string();
        let body_end = key_end + 1 + rest[key_end + 1..].find("</parameter>")?;
        let raw = rest[key_end + 1..body_end].trim();
        let value = serde_json::from_str(raw).unwrap_or_else(|_| Value::String(raw.to_string()));
        arguments.insert(key, value);
        rest = &rest[body_end + "</parameter>".len()..];
    }
    Some((name, Value::Object(arguments)))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_json_calls() {
        let (name, args) = parse(r#"{"name": "robin", "arguments": {"epsilon": 0.01}}"#).unwrap();
        assert_eq!(name, "robin");
        assert_eq!(args, json!({"epsilon": 0.01}));
    }

    #[test]
    fn reads_stringified_arguments() {
        let (_, args) =
            parse(r#"{"name": "zeta", "arguments": "{\"re\": 0.5, \"im\": 14}"}"#).unwrap();
        assert_eq!(args, json!({"re": 0.5, "im": 14}));
    }

    #[test]
    fn reads_xml_calls() {
        let (name, args) = parse(
            "<function=conjecture><parameter=title>Gaps</parameter><parameter=lean>null</parameter></function>",
        )
        .unwrap();
        assert_eq!(name, "conjecture");
        assert_eq!(args, json!({"title": "Gaps", "lean": null}));
    }
}
