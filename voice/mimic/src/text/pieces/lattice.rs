use std::collections::HashMap;

use anyhow::{Context, Result};

use super::vocabulary::{Kind, Piece};

const UNKNOWN_PENALTY: f32 = 10.0;
const PROTECTED_BONUS: f64 = 0.1;

pub struct Lexicon {
    ids: HashMap<String, usize>,
    scores: Vec<f32>,
    kinds: Vec<Kind>,
    longest: usize,
    lowest: f32,
    highest: f32,
    unknown: usize,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Span {
    pub start: usize,
    pub end: usize,
    pub id: usize,
}

#[derive(Clone, Copy, Default)]
struct Arrival {
    id: usize,
    score: f32,
    from: Option<usize>,
}

impl Arrival {
    fn offer(&mut self, score: f64, from: usize, id: usize) {
        if self.from.is_none() || score > f64::from(self.score) {
            *self = Self {
                id,
                score: score as f32,
                from: Some(from),
            };
        }
    }
}

impl Lexicon {
    pub fn new(pieces: &[Piece]) -> Result<Self> {
        let matchable =
            |kind: Kind| matches!(kind, Kind::Normal | Kind::UserDefined | Kind::Unused);
        let ids: HashMap<String, usize> = pieces
            .iter()
            .enumerate()
            .filter(|(_, piece)| matchable(piece.kind))
            .map(|(id, piece)| (piece.text.clone(), id))
            .collect();
        let normal = || pieces.iter().filter(|piece| piece.kind == Kind::Normal);
        let unknown = pieces
            .iter()
            .position(|piece| piece.kind == Kind::Unknown)
            .context("tokenizer model has no unknown piece")?;
        Ok(Self {
            longest: ids.keys().map(String::len).max().unwrap_or(0),
            ids,
            scores: pieces.iter().map(|piece| piece.score).collect(),
            kinds: pieces.iter().map(|piece| piece.kind).collect(),
            lowest: normal().map(|piece| piece.score).fold(f32::MAX, f32::min),
            highest: normal()
                .map(|piece| piece.score)
                .fold(f32::MIN_POSITIVE, f32::max),
            unknown,
        })
    }

    pub fn unknown(&self) -> usize {
        self.unknown
    }

    pub fn segment(&self, text: &str) -> Vec<Span> {
        let mut arrivals = vec![Arrival::default(); text.len() + 1];
        for (start, first) in text.char_indices() {
            self.extend_from(text, start, first.len_utf8(), &mut arrivals);
        }
        trace_back(&arrivals, text.len())
    }

    fn extend_from(&self, text: &str, start: usize, first_len: usize, arrivals: &mut [Arrival]) {
        let here = arrivals[start].score;
        let mut covers_first = false;
        for end in boundaries(text, start, self.longest) {
            let Some(&id) = self.ids.get(&text[start..end]) else {
                continue;
            };
            if self.kinds[id] == Kind::Unused {
                continue;
            }
            let score = self.piece_score(id, end - start) + f64::from(here);
            arrivals[end].offer(score, start, id);
            covers_first |= end - start == first_len;
        }
        if !covers_first {
            let score = self.lowest - UNKNOWN_PENALTY + here;
            arrivals[start + first_len].offer(f64::from(score), start, self.unknown);
        }
    }

    fn piece_score(&self, id: usize, length: usize) -> f64 {
        if self.kinds[id] == Kind::UserDefined {
            f64::from(length as f32 * self.highest) - PROTECTED_BONUS
        } else {
            f64::from(self.scores[id])
        }
    }
}

fn boundaries(text: &str, start: usize, longest: usize) -> impl Iterator<Item = usize> + '_ {
    text[start..]
        .char_indices()
        .map(move |(offset, c)| start + offset + c.len_utf8())
        .take_while(move |end| end - start <= longest)
}

fn trace_back(arrivals: &[Arrival], end: usize) -> Vec<Span> {
    let mut spans = Vec::new();
    let mut end = end;
    while let Some(start) = arrivals[end].from.filter(|_| end > 0) {
        spans.push(Span {
            start,
            end,
            id: arrivals[end].id,
        });
        end = start;
    }
    spans.reverse();
    spans
}

#[cfg(test)]
mod tests {
    use super::super::vocabulary::sample;
    use super::*;

    fn lexicon() -> Lexicon {
        Lexicon::new(&sample::pieces(true)).unwrap()
    }

    fn texts<'a>(lexicon: &Lexicon, text: &'a str) -> Vec<&'a str> {
        lexicon
            .segment(text)
            .iter()
            .map(|span| &text[span.start..span.end])
            .collect()
    }

    #[test]
    fn whole_words_beat_their_fragments() {
        let lexicon = lexicon();
        assert_eq!(texts(&lexicon, "▁hello▁world"), ["▁hello", "▁world"]);
        assert_eq!(texts(&lexicon, "▁hello."), ["▁hello", "."]);
    }

    #[test]
    fn fragments_fill_in_when_no_word_fits() {
        let lexicon = lexicon();
        assert_eq!(texts(&lexicon, "▁helo"), ["▁he", "l", "o"]);
        assert_eq!(texts(&lexicon, "▁worldld"), ["▁world", "ld"]);
    }

    #[test]
    fn uncovered_characters_become_unknown_spans() {
        let lexicon = lexicon();
        let spans = lexicon.segment("▁a日b");
        let ids: Vec<bool> = spans
            .iter()
            .map(|span| span.id == lexicon.unknown())
            .collect();
        assert_eq!(ids, [false, true, false]);
        assert_eq!((spans[1].start, spans[1].end), (4, 7));
    }

    #[test]
    fn protected_symbols_always_win_and_unused_pieces_never_match() {
        let lexicon = lexicon();
        assert_eq!(texts(&lexicon, "▁<|tag|>"), ["▁", "<|tag|>"]);
        let spans = lexicon.segment("unused");
        assert!(spans
            .iter()
            .all(|span| span.id == lexicon.unknown() || span.end - span.start == 1));
    }

    #[test]
    fn score_range_covers_only_normal_pieces() {
        let lexicon = lexicon();
        assert_eq!(lexicon.lowest, -9.5);
        assert_eq!(lexicon.highest, f32::MIN_POSITIVE);
        assert!((lexicon.piece_score(3, 7) + 0.1).abs() < 1e-12);
        assert_eq!(lexicon.longest, "▁hello".len());
        assert!(lexicon.segment("").is_empty());
    }

    #[test]
    fn a_model_without_an_unknown_piece_is_rejected() {
        let pieces = [sample::piece("a", -1.0, Kind::Normal)];
        assert!(Lexicon::new(&pieces).is_err());
    }
}
