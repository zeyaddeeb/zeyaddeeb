use super::{collapse_spaces, is_space};

const PLACEHOLDER: &str = "You need to add some text for me to talk.";
const ENDINGS: [char; 7] = ['.', '!', '?', '-', ',', ';', ':'];
const TAG_OPEN: &str = "<|";
const TAG_CLOSE: &str = "|>";
const REWRITES: [(&str, &str); 11] = [
    ("…", "..."),
    (" ,", ","),
    (" .", "."),
    (" !", "!"),
    (" ?", "?"),
    (" ;", ";"),
    (" :", ":"),
    ("“", "\""),
    ("”", "\""),
    ("‘", "'"),
    ("’", "'"),
];

pub fn tidy(text: &str) -> String {
    let text = text.trim_matches(is_space);
    if text.is_empty() {
        return PLACEHOLDER.to_string();
    }
    match leading_tags(text) {
        Some((tags, body)) => tidy_tagged(tags, body.trim_matches(is_space)),
        None => tidy_sentence(text),
    }
}

fn tidy_tagged(tags: &str, body: &str) -> String {
    let tags = collapse_spaces(tags);
    if body.is_empty() {
        tags
    } else {
        format!("{tags} {}", tidy(body))
    }
}

fn tidy_sentence(text: &str) -> String {
    let mut text = collapse_spaces(&capitalize(text));
    for (from, to) in REWRITES {
        text = text.replace(from, to);
    }
    let mut text = collapse_spaces(&text);
    if !text.ends_with(ENDINGS) {
        text.push('.');
    }
    text
}

fn capitalize(text: &str) -> String {
    let mut chars = text.chars();
    match chars.next() {
        Some(first) if first.is_lowercase() => first.to_uppercase().chain(chars).collect(),
        _ => text.to_string(),
    }
}

fn leading_tags(text: &str) -> Option<(&str, &str)> {
    let mut rest = text;
    while let Some(after) = skip_tag(rest) {
        rest = after.trim_start_matches(is_space);
    }
    let tags = &text[..text.len() - rest.len()];
    (!tags.is_empty() && !rest.contains('\n')).then_some((tags, rest))
}

fn skip_tag(text: &str) -> Option<&str> {
    let inner = text.strip_prefix(TAG_OPEN)?;
    let name_len = inner.find(|c: char| c == '|' || is_space(c))?;
    let after = inner[name_len..].strip_prefix(TAG_CLOSE)?;
    (name_len > 0).then_some(after)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_text_becomes_the_placeholder() {
        assert_eq!(tidy(""), PLACEHOLDER);
        assert_eq!(tidy(" \n\t "), PLACEHOLDER);
    }

    #[test]
    fn sentences_are_capitalized_and_terminated() {
        assert_eq!(tidy("hello there"), "Hello there.");
        assert_eq!(tidy("Already fine!"), "Already fine!");
        assert_eq!(tidy("ends with a dash -"), "Ends with a dash -");
        assert_eq!(tidy("ends with comma,"), "Ends with comma,");
        assert_eq!(tidy("x"), "X.");
        assert_eq!(tidy("ßtraße"), "SStraße.");
        assert_eq!(tidy("1st place"), "1st place.");
    }

    #[test]
    fn whitespace_and_typography_are_normalized() {
        assert_eq!(tidy("  spaced \t out\n text  "), "Spaced out text.");
        assert_eq!(
            tidy("spaces before punctuation , like this ; and this : ok !"),
            "Spaces before punctuation, like this; and this: ok!"
        );
        assert_eq!(
            tidy("“Quoted” and ‘single’ …"),
            "\"Quoted\" and 'single'..."
        );
        assert_eq!(tidy("wait … what"), "Wait... what.");
        assert_eq!(tidy("a  ,b"), "A,b.");
    }

    #[test]
    fn leading_tags_are_kept_apart_from_the_sentence() {
        assert_eq!(tidy("<|lang_en|> hello"), "<|lang_en|> Hello.");
        assert_eq!(tidy("<|lang_pt|>sem espaço"), "<|lang_pt|> Sem espaço.");
        assert_eq!(tidy("<|a|>  <|b|>\ttwo tags"), "<|a|> <|b|> Two tags.");
        assert_eq!(tidy("<|lang_fr|>"), "<|lang_fr|>");
        assert_eq!(tidy("<|lang_fr|>  "), "<|lang_fr|>");
    }

    #[test]
    fn malformed_tags_are_ordinary_text() {
        assert_eq!(tidy("<||> empty"), "<||> empty.");
        assert_eq!(tidy("<|has space|> x"), "<|has space|> x.");
        assert_eq!(tidy("<|open only"), "<|open only.");
        assert_eq!(tidy("<|a|b|> x"), "<|a|b|> x.");
        assert_eq!(tidy("<|tag|> line\nbreak"), "<|tag|> line break.");
    }

    #[test]
    fn tag_parser_reports_tags_and_body() {
        assert_eq!(
            leading_tags("<|a|> <|b|>rest"),
            Some(("<|a|> <|b|>", "rest"))
        );
        assert_eq!(leading_tags("<|a|>"), Some(("<|a|>", "")));
        assert_eq!(leading_tags("plain"), None);
        assert_eq!(skip_tag("<|x|>y"), Some("y"));
        assert_eq!(skip_tag("<|x"), None);
    }
}
