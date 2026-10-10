use anyhow::{bail, ensure, Result};

use super::wire::{Fields, Value};

const UNIGRAM: u64 = 1;

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Kind {
    Normal,
    Unknown,
    Control,
    UserDefined,
    Unused,
    Byte,
}

impl Kind {
    fn from_wire(value: u64) -> Result<Self> {
        Ok(match value {
            1 => Self::Normal,
            2 => Self::Unknown,
            3 => Self::Control,
            4 => Self::UserDefined,
            5 => Self::Unused,
            6 => Self::Byte,
            other => bail!("unknown piece type {other}"),
        })
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Piece {
    pub text: String,
    pub score: f32,
    pub kind: Kind,
}

#[derive(Debug, Clone, PartialEq)]
pub struct Whitespace {
    pub add_prefix: bool,
    pub collapse: bool,
    pub escape: bool,
}

impl Default for Whitespace {
    fn default() -> Self {
        Self {
            add_prefix: true,
            collapse: true,
            escape: true,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct Markers {
    pub start: String,
    pub stop: String,
}

impl Default for Markers {
    fn default() -> Self {
        Self {
            start: "<s>".to_string(),
            stop: "</s>".to_string(),
        }
    }
}

#[derive(Debug, Default)]
pub struct PieceModel {
    pub pieces: Vec<Piece>,
    pub whitespace: Whitespace,
    pub markers: Markers,
    pub byte_fallback: bool,
    pub charmap: Vec<u8>,
}

impl PieceModel {
    pub fn parse(bytes: &[u8]) -> Result<Self> {
        let mut model = Self::default();
        for field in Fields::new(bytes) {
            match field? {
                (1, value) => model.pieces.push(piece(value.bytes()?)?),
                (2, value) => model.read_trainer(value.bytes()?)?,
                (3, value) => model.read_normalizer(value.bytes()?)?,
                _ => {}
            }
        }
        ensure!(!model.pieces.is_empty(), "tokenizer model has no pieces");
        Ok(model)
    }

    fn read_trainer(&mut self, bytes: &[u8]) -> Result<()> {
        for field in Fields::new(bytes) {
            match field? {
                (3, value) => ensure!(
                    value.integer()? == UNIGRAM,
                    "only unigram tokenizer models are supported"
                ),
                (24, value) => ensure!(
                    !value.flag()?,
                    "whitespace-as-suffix tokenizer models are not supported"
                ),
                (35, value) => self.byte_fallback = value.flag()?,
                (46, value) => self.markers.start = value.text()?.to_string(),
                (47, value) => self.markers.stop = value.text()?.to_string(),
                _ => {}
            }
        }
        Ok(())
    }

    fn read_normalizer(&mut self, bytes: &[u8]) -> Result<()> {
        for field in Fields::new(bytes) {
            match field? {
                (2, value) => self.charmap = value.bytes()?.to_vec(),
                (3, value) => self.whitespace.add_prefix = value.flag()?,
                (4, value) => self.whitespace.collapse = value.flag()?,
                (5, value) => self.whitespace.escape = value.flag()?,
                _ => {}
            }
        }
        Ok(())
    }
}

fn piece(bytes: &[u8]) -> Result<Piece> {
    let mut piece = Piece {
        text: String::new(),
        score: 0.0,
        kind: Kind::Normal,
    };
    for field in Fields::new(bytes) {
        match field? {
            (1, value) => piece.text = value.text()?.to_string(),
            (2, value) => piece.score = value.float()?,
            (3, Value::Varint(kind)) => piece.kind = Kind::from_wire(kind)?,
            _ => {}
        }
    }
    ensure!(!piece.text.is_empty(), "tokenizer model has an empty piece");
    Ok(piece)
}

#[cfg(test)]
pub mod sample {
    use super::super::wire::encode;
    use super::*;

    pub fn piece(text: &str, score: f32, kind: Kind) -> Piece {
        Piece {
            text: text.to_string(),
            score,
            kind,
        }
    }

    pub fn pieces(with_bytes: bool) -> Vec<Piece> {
        let mut pieces = vec![
            piece("<unk>", 0.0, Kind::Unknown),
            piece("<s>", 0.0, Kind::Control),
            piece("</s>", 0.0, Kind::Control),
            piece("<|tag|>", 0.0, Kind::UserDefined),
        ];
        let bytes = (0..=255u8).filter(|_| with_bytes);
        pieces.extend(bytes.map(|byte| piece(&format!("<0x{byte:02X}>"), 0.0, Kind::Byte)));
        let scored = [
            ("▁", -3.0),
            ("▁hello", -5.0),
            ("▁world", -5.5),
            ("▁he", -6.0),
            ("llo", -6.5),
            ("l", -7.0),
            ("o", -7.0),
            ("h", -7.5),
            ("e", -7.5),
            ("w", -8.0),
            ("r", -8.0),
            ("d", -8.0),
            ("▁wor", -6.2),
            ("ld", -6.4),
            (".", -4.0),
            ("!", -4.5),
            ("▁a", -5.0),
            ("a", -7.2),
            ("b", -7.4),
            ("ab", -6.9),
            ("▁ab", -6.1),
            ("é", -9.0),
            ("tag", -8.5),
            ("<", -9.5),
            (">", -9.5),
            ("|", -9.5),
        ];
        pieces.extend(scored.map(|(text, score)| piece(text, score, Kind::Normal)));
        pieces.push(piece("unused", -1.0, Kind::Unused));
        pieces
    }

    fn kind_wire(kind: Kind) -> u64 {
        match kind {
            Kind::Normal => 1,
            Kind::Unknown => 2,
            Kind::Control => 3,
            Kind::UserDefined => 4,
            Kind::Unused => 5,
            Kind::Byte => 6,
        }
    }

    pub fn serialized(pieces: &[Piece], byte_fallback: bool) -> Vec<u8> {
        let mut model = Vec::new();
        for piece in pieces {
            let mut entry = Vec::new();
            encode::bytes(1, piece.text.as_bytes(), &mut entry);
            encode::float(2, piece.score, &mut entry);
            encode::integer(3, kind_wire(piece.kind), &mut entry);
            encode::bytes(1, &entry, &mut model);
        }
        let mut trainer = Vec::new();
        encode::integer(3, UNIGRAM, &mut trainer);
        encode::integer(35, u64::from(byte_fallback), &mut trainer);
        encode::bytes(2, &trainer, &mut model);
        let mut normalizer = Vec::new();
        encode::bytes(1, b"identity", &mut normalizer);
        encode::bytes(3, &normalizer, &mut model);
        model
    }
}

#[cfg(test)]
mod tests {
    use super::super::wire::encode;
    use super::*;

    #[test]
    fn serialized_model_round_trips() {
        let pieces = sample::pieces(true);
        assert_eq!(pieces.len(), 287);
        assert_eq!(sample::pieces(false).len(), 31);
        let model = PieceModel::parse(&sample::serialized(&pieces, true)).unwrap();
        assert_eq!(model.pieces, pieces);
        assert!(model.byte_fallback);
        assert_eq!(model.whitespace, Whitespace::default());
        assert_eq!(model.markers, Markers::default());
        assert!(model.charmap.is_empty());
    }

    #[test]
    fn defaults_apply_when_fields_are_absent() {
        let mut entry = Vec::new();
        encode::bytes(1, b"x", &mut entry);
        let mut bytes = Vec::new();
        encode::bytes(1, &entry, &mut bytes);
        let model = PieceModel::parse(&bytes).unwrap();
        assert_eq!(model.pieces[0], sample::piece("x", 0.0, Kind::Normal));
        assert!(!model.byte_fallback);
    }

    #[test]
    fn normalizer_flags_and_markers_are_read() {
        let mut bytes = sample::serialized(&sample::pieces(false), false);
        let mut normalizer = Vec::new();
        encode::bytes(2, &[1, 2, 3], &mut normalizer);
        encode::integer(3, 0, &mut normalizer);
        encode::integer(4, 0, &mut normalizer);
        encode::integer(5, 0, &mut normalizer);
        encode::bytes(3, &normalizer, &mut bytes);
        let mut trainer = Vec::new();
        encode::bytes(46, b"<go>", &mut trainer);
        encode::bytes(2, &trainer, &mut bytes);
        let model = PieceModel::parse(&bytes).unwrap();
        assert_eq!(model.charmap, [1, 2, 3]);
        assert!(!model.whitespace.add_prefix && !model.whitespace.collapse);
        assert!(!model.whitespace.escape);
        assert_eq!(model.markers.start, "<go>");
    }

    #[test]
    fn unsupported_models_are_rejected() {
        for (number, value) in [(3, 2), (24, 1)] {
            let mut trainer = Vec::new();
            encode::integer(number, value, &mut trainer);
            let mut bytes = sample::serialized(&sample::pieces(false), false);
            encode::bytes(2, &trainer, &mut bytes);
            assert!(PieceModel::parse(&bytes).is_err());
        }
        assert!(PieceModel::parse(&[]).is_err());
    }
}
