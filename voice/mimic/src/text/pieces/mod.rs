mod charmap;
mod cleaner;
mod lattice;
pub mod vocabulary;
mod wire;

use std::path::Path;

use anyhow::{Context, Result};

use self::charmap::CharMap;
use self::cleaner::Cleaner;
use self::lattice::{Lexicon, Span};
use self::vocabulary::{Kind, Piece, PieceModel};
use super::tidy::tidy;

const MAX_PIECES: usize = 512;
const FALLBACK_START: u32 = 1;
const FALLBACK_STOP: u32 = 2;

pub struct PieceTokenizer {
    cleaner: Cleaner,
    lexicon: Lexicon,
    bytes: Option<Vec<u32>>,
    start: u32,
    stop: u32,
}

impl PieceTokenizer {
    pub fn open(path: &Path) -> Result<Self> {
        let bytes = std::fs::read(path).with_context(|| format!("reading {}", path.display()))?;
        let model =
            PieceModel::parse(&bytes).with_context(|| format!("parsing {}", path.display()))?;
        Self::new(&model)
    }

    pub fn new(model: &PieceModel) -> Result<Self> {
        let protected = texts_of(&model.pieces, Kind::UserDefined);
        let charmap = CharMap::parse(&model.charmap)?;
        Ok(Self {
            cleaner: Cleaner::new(charmap, protected, model.whitespace.clone()),
            lexicon: Lexicon::new(&model.pieces)?,
            bytes: model
                .byte_fallback
                .then(|| byte_ids(&model.pieces))
                .transpose()?,
            start: control_id(&model.pieces, &model.markers.start).unwrap_or(FALLBACK_START),
            stop: control_id(&model.pieces, &model.markers.stop).unwrap_or(FALLBACK_STOP),
        })
    }

    pub fn encode(&self, text: &str) -> Vec<u32> {
        let mut ids = vec![self.start];
        ids.extend(self.encode_raw(&tidy(text)));
        ids.push(self.stop);
        ids.truncate(MAX_PIECES);
        ids
    }

    fn encode_raw(&self, text: &str) -> Vec<u32> {
        let cleaned = self.cleaner.clean(text);
        let spans = self.lexicon.segment(&cleaned);
        match &self.bytes {
            Some(bytes) => self.spell_unknowns(&cleaned, &spans, bytes),
            None => self.merge_unknowns(&spans),
        }
    }

    fn spell_unknowns(&self, cleaned: &str, spans: &[Span], bytes: &[u32]) -> Vec<u32> {
        let mut ids = Vec::with_capacity(spans.len());
        for span in spans {
            if span.id == self.lexicon.unknown() {
                let raw = &cleaned.as_bytes()[span.start..span.end];
                ids.extend(raw.iter().map(|byte| bytes[usize::from(*byte)]));
            } else {
                ids.push(span.id as u32);
            }
        }
        ids
    }

    fn merge_unknowns(&self, spans: &[Span]) -> Vec<u32> {
        let unknown = self.lexicon.unknown();
        let mut ids: Vec<u32> = Vec::with_capacity(spans.len());
        for span in spans {
            let repeats = span.id == unknown && ids.last() == Some(&(unknown as u32));
            if !repeats {
                ids.push(span.id as u32);
            }
        }
        ids
    }
}

fn texts_of(pieces: &[Piece], kind: Kind) -> Vec<String> {
    pieces
        .iter()
        .filter(|piece| piece.kind == kind)
        .map(|piece| piece.text.clone())
        .collect()
}

fn control_id(pieces: &[Piece], text: &str) -> Option<u32> {
    pieces
        .iter()
        .position(|piece| piece.kind == Kind::Control && piece.text == text)
        .map(|id| id as u32)
}

fn byte_ids(pieces: &[Piece]) -> Result<Vec<u32>> {
    (0..=255u8)
        .map(|byte| {
            let text = format!("<0x{byte:02X}>");
            pieces
                .iter()
                .position(|piece| piece.kind == Kind::Byte && piece.text == text)
                .map(|id| id as u32)
                .with_context(|| format!("tokenizer model has no piece for byte {text}"))
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::vocabulary::sample;
    use super::*;
    use crate::testing;

    fn tokenizer(byte_fallback: bool) -> PieceTokenizer {
        let bytes = sample::serialized(&sample::pieces(byte_fallback), byte_fallback);
        PieceTokenizer::new(&PieceModel::parse(&bytes).unwrap()).unwrap()
    }

    #[test]
    fn sample_model_matches_reference_tokenizer() {
        let tokenizer = tokenizer(true);
        for (text, expected) in SPELLED_CASES {
            assert_eq!(tokenizer.encode_raw(text), expected, "{text:?}");
        }
    }

    #[test]
    fn without_byte_fallback_unknown_runs_collapse() {
        let tokenizer = tokenizer(false);
        for (text, expected) in MERGED_CASES {
            assert_eq!(tokenizer.encode_raw(text), expected, "{text:?}");
        }
    }

    const SPELLED_CASES: [(&str, &[u32]); 17] = [
        ("hello world", &[261, 262]),
        ("  hello   world.  ", &[261, 262, 274]),
        ("helo", &[263, 265, 266]),
        ("worldld", &[262, 273]),
        ("a日b", &[276, 234, 155, 169, 278]),
        ("<|tag|> hello", &[260, 3, 261]),
        ("ab ab!", &[280, 280, 275]),
        ("unused", &[260, 121, 114, 121, 119, 268, 271]),
        ("é hello", &[260, 281, 261]),
        ("hello<|tag|>world", &[261, 3, 269, 266, 270, 273]),
        ("", &[]),
        ("x y", &[260, 124, 260, 125]),
        ("a\tb", &[276, 13, 278]),
        (
            "ééa 日本 ld",
            &[
                260, 281, 281, 277, 260, 234, 155, 169, 234, 160, 176, 260, 273,
            ],
        ),
        ("hello !", &[261, 260, 275]),
        ("<|tag|><|tag|>", &[260, 3, 3]),
        ("abab a b", &[280, 279, 276, 260, 278]),
    ];

    const MERGED_CASES: [(&str, &[u32]); 17] = [
        ("hello world", &[5, 6]),
        ("  hello   world.  ", &[5, 6, 18]),
        ("helo", &[7, 9, 10]),
        ("worldld", &[6, 17]),
        ("a日b", &[20, 0, 22]),
        ("<|tag|> hello", &[4, 3, 5]),
        ("ab ab!", &[24, 24, 19]),
        ("unused", &[4, 0, 12, 15]),
        ("é hello", &[4, 25, 5]),
        ("hello<|tag|>world", &[5, 3, 13, 10, 14, 17]),
        ("", &[]),
        ("x y", &[4, 0, 4, 0]),
        ("a\tb", &[20, 0, 22]),
        ("ééa 日本 ld", &[4, 25, 25, 21, 4, 0, 4, 17]),
        ("hello !", &[5, 4, 19]),
        ("<|tag|><|tag|>", &[4, 3, 3]),
        ("abab a b", &[24, 23, 20, 4, 22]),
    ];

    #[test]
    fn encoding_wraps_tidied_text_in_markers() {
        let tokenizer = tokenizer(true);
        let ids = tokenizer.encode("hello world");
        assert_eq!((ids[0], ids[ids.len() - 1]), (1, 2));
        assert_eq!(ids[1..ids.len() - 1], tokenizer.encode_raw("Hello world."));
    }

    #[test]
    fn long_inputs_are_capped() {
        let tokenizer = tokenizer(true);
        let ids = tokenizer.encode(&"hello ".repeat(600));
        assert_eq!(ids.len(), MAX_PIECES);
        assert_eq!(ids[0], 1);
    }

    #[test]
    fn missing_byte_pieces_are_an_error() {
        let pieces: Vec<Piece> = sample::pieces(true)
            .into_iter()
            .filter(|piece| piece.text != "<0x41>")
            .collect();
        let model = PieceModel::parse(&sample::serialized(&pieces, true)).unwrap();
        assert!(PieceTokenizer::new(&model).is_err());
    }

    #[test]
    fn parity_tokenizer_cases() {
        let (Some(dir), Some(cases)) = (testing::models_dir(), testing::json_fixture("text"))
        else {
            return;
        };
        let tokenizer = PieceTokenizer::open(&dir.join(crate::weights::PIECES_FILE)).unwrap();
        let cases = cases["tokenizer"].as_array().unwrap();
        for case in cases {
            let text = case["text"].as_str().unwrap();
            let ids = |key: &str| -> Vec<u32> {
                let values = case[key].as_array().unwrap().iter();
                values.map(|id| id.as_u64().unwrap() as u32).collect()
            };
            assert_eq!(tidy(text), case["tidied"].as_str().unwrap(), "{text:?}");
            assert_eq!(tokenizer.encode_raw(text), ids("raw_ids"), "{text:?}");
            assert_eq!(tokenizer.encode(text), ids("ids"), "{text:?}");
        }
        println!("parity tokenizer: {} cases match", cases.len());
    }
}
