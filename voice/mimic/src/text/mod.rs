pub mod pieces;
pub mod split;
pub mod tidy;

pub fn is_space(c: char) -> bool {
    c.is_whitespace() || ('\u{1c}'..='\u{1f}').contains(&c)
}

pub fn collapse_spaces(text: &str) -> String {
    text.split(is_space)
        .filter(|word| !word.is_empty())
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collapsing_trims_and_joins_with_single_spaces() {
        assert_eq!(collapse_spaces("  a \t b\n\nc  "), "a b c");
        assert_eq!(collapse_spaces("a\u{a0}b\u{3000}c\u{1f}d"), "a b c d");
        assert_eq!(collapse_spaces(" \n "), "");
        assert_eq!(collapse_spaces("a\u{200b}b"), "a\u{200b}b");
    }
}
