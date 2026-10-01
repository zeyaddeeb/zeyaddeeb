use serde_json::{Map, Value};
use std::ops::Range;

pub fn parse(block: &str) -> Option<(String, Value)> {
    json(block).or_else(|| xml(block))
}

pub fn loose(text: &str, names: &[&str]) -> Vec<(Range<usize>, String, Value)> {
    objects(text)
        .into_iter()
        .filter_map(|span| {
            let value: Value = serde_json::from_str(&text[span.clone()]).ok()?;
            let (name, arguments) = call(&value)?;

            (names.contains(&name.as_str()) && !schema(&arguments))
                .then_some((span, name, arguments))
        })
        .collect()
}

fn json(block: &str) -> Option<(String, Value)> {
    call(&serde_json::from_str(block.trim()).ok()?)
}

fn call(value: &Value) -> Option<(String, Value)> {
    let value = if value["function"].is_object() {
        &value["function"]
    } else {
        value
    };

    let name = value["name"].as_str()?.to_string();

    let given = if value["arguments"].is_null() {
        &value["parameters"]
    } else {
        &value["arguments"]
    };

    let arguments = match given {
        Value::String(text) => serde_json::from_str(text).ok()?,
        Value::Null => Value::Object(Map::new()),
        other => other.clone(),
    };

    arguments.is_object().then_some((name, arguments))
}

fn schema(arguments: &Value) -> bool {
    arguments["properties"].is_object() || arguments["type"] == "object"
}

fn objects(text: &str) -> Vec<Range<usize>> {
    let mut spans = Vec::new();
    let mut depth = 0usize;
    let mut start = 0;
    let mut quoted = false;
    let mut escaped = false;

    for (at, c) in text.char_indices() {
        if quoted {
            match (escaped, c) {
                (true, _) => escaped = false,
                (false, '\\') => escaped = true,
                (false, '"') => quoted = false,
                _ => {}
            }

            continue;
        }

        match c {
            '"' if depth > 0 => quoted = true,
            '{' => {
                if depth == 0 {
                    start = at;
                }

                depth += 1;
            }
            '}' if depth > 0 => {
                depth -= 1;

                if depth == 0 {
                    spans.push(start..at + 1);
                }
            }
            _ => {}
        }
    }

    spans
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

    #[test]
    fn reads_parameters_and_wrapped_functions() {
        let (name, args) =
            parse(r#"{"name": "line", "parameters": {"from": 10, "to": 60}}"#).unwrap();

        assert_eq!(name, "line");
        assert_eq!(args, json!({"from": 10, "to": 60}));

        let (name, _) =
            parse(r#"{"type": "function", "function": {"name": "zeta", "arguments": {}}}"#)
                .unwrap();

        assert_eq!(name, "zeta");
    }

    #[test]
    fn finds_loose_calls_in_prose() {
        let text = r#"So {"name": "contour", "arguments": {"sigma_from": 0.51, "note": "a } in a string"}} then stop."#;
        let found = loose(text, &["contour", "line"]);

        assert_eq!(found.len(), 1);

        let (span, name, args) = &found[0];

        assert_eq!(name, "contour");
        assert_eq!(args["sigma_from"], json!(0.51));
        assert_eq!(&text[..span.start], "So ");
        assert_eq!(&text[span.end..], " then stop.");
    }

    #[test]
    fn ignores_unknown_tools_schemas_and_plain_objects() {
        let text = r#"{"name": "rm", "arguments": {}} {"name": "contour", "parameters": {"type": "object", "properties": {"sigma_from": {"type": "number"}}}} {"field": "t", "op": "<", "value": 0.5} {"name": "contour""#;

        assert!(loose(text, &["contour"]).is_empty());
    }

    #[test]
    fn reads_multiline_xml_with_a_prediction() {
        let (name, args) = parse(
            "\n<function=contour>\n<parameter=expect>\n{\"field\": \"t\", \"op\": \"<\", \"value\": 0.5}\n</parameter>\n<parameter=sigma_from>\n0.505\n</parameter>\n</function>\n",
        )
        .unwrap();

        assert_eq!(name, "contour");

        assert_eq!(
            args,
            json!({"expect": {"field": "t", "op": "<", "value": 0.5}, "sigma_from": 0.505})
        );
    }
}
