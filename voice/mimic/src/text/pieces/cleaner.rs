use super::charmap::CharMap;
use super::vocabulary::Whitespace;

pub const SPACE_MARK: char = '▁';

pub struct Cleaner {
    charmap: Option<CharMap>,
    protected: Vec<String>,
    whitespace: Whitespace,
}

struct Step<'a> {
    text: &'a str,
    consumed: usize,
}

impl Cleaner {
    pub fn new(charmap: Option<CharMap>, protected: Vec<String>, whitespace: Whitespace) -> Self {
        Self {
            charmap,
            protected,
            whitespace,
        }
    }

    pub fn clean(&self, input: &str) -> String {
        let input = self.skip_leading_spaces(input);
        if input.is_empty() {
            return String::new();
        }
        let mut cleaned = String::with_capacity(input.len() * 2);
        if self.whitespace.add_prefix {
            cleaned.push(self.space());
        }
        self.rewrite(input, &mut cleaned);
        if self.whitespace.collapse {
            cleaned.truncate(cleaned.trim_end_matches(self.space()).len());
        }
        cleaned
    }

    fn space(&self) -> char {
        if self.whitespace.escape {
            SPACE_MARK
        } else {
            ' '
        }
    }

    fn skip_leading_spaces<'a>(&self, input: &'a str) -> &'a str {
        let mut rest = input;
        while self.whitespace.collapse && !rest.is_empty() {
            let step = self.step(rest);
            if step.text != " " {
                break;
            }
            rest = &rest[step.consumed..];
        }
        rest
    }

    fn rewrite(&self, input: &str, cleaned: &mut String) {
        let mut rest = input;
        let mut after_space = self.whitespace.collapse;
        while !rest.is_empty() {
            let step = self.step(rest);
            let text = if after_space {
                step.text.trim_start_matches(' ')
            } else {
                step.text
            };
            if !text.is_empty() {
                cleaned.extend(
                    text.chars()
                        .map(|c| if c == ' ' { self.space() } else { c }),
                );
                after_space = text.ends_with(' ');
            }
            after_space &= self.whitespace.collapse;
            rest = &rest[step.consumed..];
        }
    }

    fn step<'a>(&'a self, rest: &'a str) -> Step<'a> {
        if let Some(symbol) = self.protected_prefix(rest) {
            return Step {
                text: symbol,
                consumed: symbol.len(),
            };
        }
        let rewrite = self
            .charmap
            .as_ref()
            .and_then(|map| map.longest_rewrite(rest.as_bytes()));
        match rewrite {
            Some(rewrite) if rest.is_char_boundary(rewrite.consumed) => Step {
                text: rewrite.replacement,
                consumed: rewrite.consumed,
            },
            _ => first_char(rest),
        }
    }

    fn protected_prefix<'a>(&self, rest: &'a str) -> Option<&'a str> {
        self.protected
            .iter()
            .filter(|symbol| rest.starts_with(symbol.as_str()))
            .map(String::len)
            .max()
            .map(|length| &rest[..length])
    }
}

fn first_char(rest: &str) -> Step<'_> {
    let length = rest.chars().next().map_or(0, char::len_utf8);
    Step {
        text: &rest[..length],
        consumed: length,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn cleaner(whitespace: Whitespace) -> Cleaner {
        Cleaner::new(
            None,
            vec!["<|tag|>".to_string(), "<|tag|>x".to_string()],
            whitespace,
        )
    }

    #[test]
    fn spaces_become_marks_with_a_leading_one() {
        let cleaner = cleaner(Whitespace::default());
        assert_eq!(cleaner.clean("hello world"), "▁hello▁world");
        assert_eq!(cleaner.clean("  hello   world  "), "▁hello▁world");
        assert_eq!(cleaner.clean(""), "");
        assert_eq!(cleaner.clean("   "), "");
        assert_eq!(cleaner.clean("a\tb"), "▁a\tb");
    }

    #[test]
    fn flags_switch_each_behavior_off() {
        let keep = Whitespace {
            add_prefix: false,
            collapse: false,
            escape: true,
        };
        assert_eq!(cleaner(keep).clean(" a  b "), "▁a▁▁b▁");
        let plain = Whitespace {
            add_prefix: true,
            collapse: true,
            escape: false,
        };
        assert_eq!(cleaner(plain).clean(" a  b "), " a b");
    }

    #[test]
    fn protected_symbols_take_the_longest_match() {
        let cleaner = cleaner(Whitespace::default());
        assert_eq!(cleaner.protected_prefix("<|tag|>xy"), Some("<|tag|>x"));
        assert_eq!(cleaner.protected_prefix("<|tag|> y"), Some("<|tag|>"));
        assert_eq!(cleaner.protected_prefix("<|tag"), None);
        assert_eq!(cleaner.clean("<|tag|> hi"), "▁<|tag|>▁hi");
    }

    #[test]
    fn steps_advance_by_whole_characters() {
        let cleaner = cleaner(Whitespace::default());
        assert_eq!(cleaner.step("éa").consumed, 2);
        assert_eq!(cleaner.clean("é 日本"), "▁é▁日本");
    }
}
