use super::collapse_spaces;

const SENTENCE_ENDS: [char; 4] = ['.', '!', '?', '…'];
const CLAUSE_ENDS: [char; 3] = [',', ';', ':'];

pub fn split(text: &str, limit: usize) -> Vec<String> {
    let text = collapse_spaces(text);
    if text.is_empty() {
        return Vec::new();
    }
    if fits(&text, limit) {
        return vec![text];
    }
    pack(break_after(&text, &SENTENCE_ENDS), limit)
        .into_iter()
        .flat_map(|sentence| split_sentence(sentence, limit))
        .collect()
}

fn split_sentence(sentence: String, limit: usize) -> Vec<String> {
    if fits(&sentence, limit) {
        return vec![sentence];
    }
    pack(break_after(&sentence, &CLAUSE_ENDS), limit)
        .into_iter()
        .flat_map(|clause| split_clause(clause, limit))
        .collect()
}

fn split_clause(clause: String, limit: usize) -> Vec<String> {
    if fits(&clause, limit) {
        return vec![clause];
    }
    pack(clause.split(' ').collect(), limit)
}

fn length(text: &str) -> usize {
    text.chars().count()
}

fn fits(text: &str, limit: usize) -> bool {
    length(text) <= limit
}

fn break_after<'a>(text: &'a str, marks: &[char]) -> Vec<&'a str> {
    let mut parts = Vec::new();
    let mut start = 0;
    let mut previous = None;
    for (index, current) in text.char_indices() {
        if current == ' ' && previous.is_some_and(|c| marks.contains(&c)) {
            parts.push(&text[start..index]);
            start = index + 1;
        }
        previous = Some(current);
    }
    parts.push(&text[start..]);
    parts
}

fn pack(parts: Vec<&str>, limit: usize) -> Vec<String> {
    let mut packed = Vec::new();
    let mut current = String::new();
    for part in parts {
        if current.is_empty() {
            current.push_str(part);
        } else if length(&current) + 1 + length(part) <= limit {
            current.push(' ');
            current.push_str(part);
        } else {
            packed.push(std::mem::replace(&mut current, part.to_string()));
        }
    }
    if !current.is_empty() {
        packed.push(current);
    }
    packed
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing;

    const PARAGRAPH: &str = "One sentence here. Another sentence there! A third one? Yes… and more, with clauses; and colons: all of them.";

    #[test]
    fn short_text_is_one_segment_and_blank_text_is_none() {
        assert_eq!(split("short text", 300), ["short text"]);
        assert_eq!(
            split("  lots   of \n whitespace  ", 300),
            ["lots of whitespace"]
        );
        assert!(split("", 300).is_empty());
        assert!(split(" \n ", 300).is_empty());
    }

    #[test]
    fn sentences_are_packed_up_to_the_limit() {
        assert_eq!(
            split(PARAGRAPH, 40),
            [
                "One sentence here.",
                "Another sentence there! A third one?",
                "Yes…",
                "and more, with clauses; and colons:",
                "all of them."
            ]
        );
    }

    #[test]
    fn long_sentences_fall_back_to_clauses_then_words() {
        assert_eq!(
            split(PARAGRAPH, 12),
            [
                "One sentence",
                "here.",
                "Another",
                "sentence",
                "there!",
                "A third one?",
                "Yes…",
                "and more,",
                "with",
                "clauses;",
                "and colons:",
                "all of them."
            ]
        );
    }

    #[test]
    fn unbreakable_words_are_kept_whole() {
        assert_eq!(
            split(
                "averyveryverylongwordwithoutanyspacesatallthatexceedsthelimit and more",
                20
            ),
            [
                "averyveryverylongwordwithoutanyspacesatallthatexceedsthelimit",
                "and more"
            ]
        );
    }

    #[test]
    fn limits_count_characters_not_bytes() {
        assert_eq!(split("ééééé ééééé", 11), ["ééééé ééééé"]);
        assert_eq!(split("ééééé ééééé", 10), ["ééééé", "ééééé"]);
    }

    #[test]
    fn breaks_follow_only_the_listed_marks() {
        assert_eq!(
            break_after("a. b! c d? e", &SENTENCE_ENDS),
            ["a.", "b!", "c d?", "e"]
        );
        assert_eq!(break_after("a.b c", &SENTENCE_ENDS), ["a.b c"]);
        assert_eq!(break_after("x, y; z", &CLAUSE_ENDS), ["x,", "y;", "z"]);
    }

    #[test]
    fn parity_split_cases() {
        let Some(cases) = testing::json_fixture("text") else {
            return;
        };
        for case in cases["split"].as_array().unwrap() {
            let text = case["text"].as_str().unwrap();
            let limit = case["limit"].as_u64().unwrap() as usize;
            let expected: Vec<&str> = case["segments"]
                .as_array()
                .unwrap()
                .iter()
                .map(|s| s.as_str().unwrap())
                .collect();
            assert_eq!(split(text, limit), expected, "{text:?} at {limit}");
        }
    }
}
