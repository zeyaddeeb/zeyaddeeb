use crate::agent::memory::Verdict;
use serde_json::{Map, Value};

pub type Fields = Map<String, Value>;

struct Range {
    low: f64,
    high: f64,
    low_open: bool,
    high_open: bool,
    source: &'static str,
}

const PLATT_TRUDGIAN: &str = "Platt and Trudgian 2021";

fn published(tool: &str, field: &str, fields: &Fields) -> Option<Range> {
    let closed = |low, high, source| Range {
        low,
        high,
        low_open: false,
        high_open: false,
        source,
    };
    match (tool, field) {
        ("line", "missing") => Some(closed(0.0, 0.0, PLATT_TRUDGIAN)),
        ("contour", "zeros") => Some(closed(0.0, 0.0, PLATT_TRUDGIAN)),
        ("hasse", "worst_ratio") => Some(closed(0.0, 1.0, "Hasse 1933")),
        ("mertens", "worst_ratio") => Some(Range {
            high_open: true,
            ..closed(0.0, 1.0, "Hurst 2018")
        }),
        ("robin", "margin") if fields.get("digits")?.as_f64()? > 5040f64.log10() => Some(Range {
            low_open: true,
            ..closed(0.0, 1.0, "Briggs 2006")
        }),
        ("spacing", "distance_gue" | "distance_poisson") => {
            Some(closed(0.0, 1.0, "Kolmogorov distances lie in [0, 1]"))
        }
        _ => None,
    }
}

pub fn known(tool: &str, verdict: &Verdict, fields: &Fields) -> Option<&'static str> {
    let range = published(tool, &verdict.field, fields)?;
    let value = verdict.value;
    let guaranteed = match verdict.op.as_str() {
        "<" => range.high < value || (range.high_open && range.high <= value),
        "<=" => range.high <= value,
        ">" => range.low > value || (range.low_open && range.low >= value),
        ">=" => range.low >= value,
        _ => range.low == range.high && range.low == value,
    };
    guaranteed.then_some(range.source)
}

pub fn grade(expect: &Value, fields: &Fields) -> Result<Option<Verdict>, String> {
    if expect.is_null() {
        return Ok(None);
    }
    let field = expect["field"]
        .as_str()
        .ok_or("expect needs a field")?
        .trim()
        .to_lowercase();
    let op = expect["op"]
        .as_str()
        .ok_or("expect needs an op")?
        .trim()
        .to_string();
    let value = expect["value"]
        .as_f64()
        .ok_or("expect needs a numeric value")?;
    let observed = fields.get(&field).and_then(Value::as_f64).ok_or_else(|| {
        let names: Vec<&str> = fields.keys().map(String::as_str).collect();
        format!(
            "There is no field {field}; this instrument reports {}.",
            names.join(", ")
        )
    })?;
    let held = match op.as_str() {
        "<" => observed < value,
        "<=" => observed <= value,
        ">" => observed > value,
        ">=" => observed >= value,
        "=" | "==" => (observed - value).abs() <= 1e-9 * value.abs().max(1.0),
        other => return Err(format!("Unknown op {other}; use <, <=, >, >= or =.")),
    };
    Ok(Some(Verdict {
        field,
        op,
        value,
        observed,
        held,
        known: None,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fields() -> Fields {
        json!({"missing": 0, "margin": 0.0123})
            .as_object()
            .unwrap()
            .clone()
    }

    #[test]
    fn grades_predictions() {
        let held = grade(
            &json!({"field": "missing", "op": "=", "value": 0}),
            &fields(),
        )
        .unwrap()
        .unwrap();
        assert!(held.held);
        let broken = grade(
            &json!({"field": "margin", "op": "<", "value": 0.01}),
            &fields(),
        )
        .unwrap()
        .unwrap();
        assert!(!broken.held);
        assert_eq!(broken.observed, 0.0123);
    }

    fn verdict(field: &str, op: &str, value: f64) -> Verdict {
        Verdict {
            field: field.into(),
            op: op.into(),
            value,
            observed: 0.0,
            held: true,
            known: None,
        }
    }

    #[test]
    fn predictions_a_theorem_guarantees_are_known() {
        let empty = Fields::new();
        assert_eq!(
            known("hasse", &verdict("worst_ratio", "<=", 1.0), &empty),
            Some("Hasse 1933")
        );
        assert_eq!(
            known("hasse", &verdict("worst_ratio", "<", 1.0), &empty),
            None
        );
        assert_eq!(
            known("hasse", &verdict("worst_ratio", "<", 0.9), &empty),
            None
        );
        assert!(known("line", &verdict("missing", "=", 0.0), &empty).is_some());
        assert!(known("line", &verdict("missing", "<", 1.0), &empty).is_some());
        assert!(known("line", &verdict("closest_gap", ">", 0.1), &empty).is_none());
        assert!(known("contour", &verdict("zeros", "=", 0.0), &empty).is_some());
        assert!(known("mertens", &verdict("worst_ratio", "<", 1.0), &empty).is_some());
        assert!(known("mertens", &verdict("worst_ratio", "<", 0.5), &empty).is_none());
        let large = json!({"digits": 40.0}).as_object().unwrap().clone();
        let small = json!({"digits": 2.0}).as_object().unwrap().clone();
        assert!(known("robin", &verdict("margin", ">", 0.0), &large).is_some());
        assert!(known("robin", &verdict("margin", ">", 0.0), &small).is_none());
        assert!(known("robin", &verdict("margin", "<", 0.01), &large).is_none());
    }

    #[test]
    fn explains_bad_predictions() {
        assert!(grade(&Value::Null, &fields()).unwrap().is_none());
        let error =
            grade(&json!({"field": "zeros", "op": "=", "value": 1}), &fields()).unwrap_err();
        assert!(
            error.contains("missing, margin") || error.contains("margin, missing"),
            "{error}"
        );
        assert!(grade(
            &json!({"field": "margin", "op": "≈", "value": 1}),
            &fields()
        )
        .is_err());
    }
}
