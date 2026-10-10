use anyhow::{ensure, Context, Result};

const UNIT_BYTES: usize = 4;
const LEAF_BIT: u32 = 1 << 8;
const VALUE_MASK: u32 = (1 << 31) - 1;
const LABEL_MASK: u32 = (1 << 31) | 0xff;
const WIDE_OFFSET_BIT: u32 = 1 << 9;

pub struct CharMap {
    units: Vec<u32>,
    replacements: Vec<u8>,
}

#[derive(Debug, PartialEq)]
pub struct Rewrite<'a> {
    pub consumed: usize,
    pub replacement: &'a str,
}

impl CharMap {
    pub fn parse(blob: &[u8]) -> Result<Option<Self>> {
        if blob.is_empty() {
            return Ok(None);
        }
        let (header, body) = blob
            .split_at_checked(UNIT_BYTES)
            .context("character map is truncated")?;
        let trie_bytes = u32::from_le_bytes(header.try_into()?) as usize;
        ensure!(
            trie_bytes.is_multiple_of(UNIT_BYTES),
            "character map trie is misaligned"
        );
        let (trie, replacements) = body
            .split_at_checked(trie_bytes)
            .context("character map trie is truncated")?;
        let (units, _) = trie.as_chunks::<UNIT_BYTES>();
        let units = units.iter().map(|unit| u32::from_le_bytes(*unit)).collect();
        Ok(Some(Self {
            units,
            replacements: replacements.to_vec(),
        }))
    }

    pub fn longest_rewrite(&self, input: &[u8]) -> Option<Rewrite<'_>> {
        let mut node = offset(*self.units.first()?);
        let mut found = None;
        for (index, &byte) in input.iter().enumerate() {
            node ^= usize::from(byte);
            let Some(&unit) = self.units.get(node) else {
                break;
            };
            if unit & LABEL_MASK != u32::from(byte) {
                break;
            }
            node ^= offset(unit);
            if unit & LEAF_BIT != 0 {
                found = self
                    .units
                    .get(node)
                    .map(|leaf| (index + 1, leaf & VALUE_MASK));
            }
        }
        let (consumed, start) = found?;
        Some(Rewrite {
            consumed,
            replacement: self.replacement(start as usize)?,
        })
    }

    fn replacement(&self, start: usize) -> Option<&str> {
        let tail = self.replacements.get(start..)?;
        let end = tail.iter().position(|byte| *byte == 0)?;
        std::str::from_utf8(&tail[..end]).ok()
    }
}

fn offset(unit: u32) -> usize {
    ((unit >> 10) << ((unit & WIDE_OFFSET_BIT) >> 6)) as usize
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing;

    fn unit(offset: u32, label: u8, leaf: bool) -> u32 {
        offset << 10 | u32::from(leaf) << 8 | u32::from(label)
    }

    fn tiny_map() -> CharMap {
        let mut units = vec![0u32; 512];
        units[0] = unit(256, 0, false);
        units[256 ^ usize::from(b'a')] = unit(1, b'a', true);
        let after_a = (256 ^ usize::from(b'a')) ^ 1;
        units[after_a] = 0;
        units[after_a ^ usize::from(b'b')] = unit(2, b'b', true);
        units[after_a ^ usize::from(b'b') ^ 2] = 2;
        CharMap {
            units,
            replacements: b"x\0yz\0".to_vec(),
        }
    }

    #[test]
    fn longest_rule_wins() {
        let map = tiny_map();
        assert_eq!(
            map.longest_rewrite(b"abc"),
            Some(Rewrite {
                consumed: 2,
                replacement: "yz"
            })
        );
        assert_eq!(
            map.longest_rewrite(b"ac"),
            Some(Rewrite {
                consumed: 1,
                replacement: "x"
            })
        );
        assert_eq!(map.longest_rewrite(b"b"), None);
        assert_eq!(map.longest_rewrite(b""), None);
    }

    #[test]
    fn blob_layout_is_size_trie_then_strings() {
        let mut blob = 8u32.to_le_bytes().to_vec();
        blob.extend(7u32.to_le_bytes());
        blob.extend(9u32.to_le_bytes());
        blob.extend(b"hi\0");
        let map = CharMap::parse(&blob).unwrap().unwrap();
        assert_eq!(map.units, [7, 9]);
        assert_eq!(map.replacements, b"hi\0");
        assert!(CharMap::parse(&[]).unwrap().is_none());
        assert!(CharMap::parse(&[1, 0]).is_err());
        assert!(CharMap::parse(&[64, 0, 0, 0, 1, 2]).is_err());
        assert!(CharMap::parse(&[3, 0, 0, 0, 1, 2, 3]).is_err());
    }

    #[test]
    fn wide_offsets_shift_by_eight_bits() {
        assert_eq!(offset(5 << 10), 5);
        assert_eq!(offset(5 << 10 | WIDE_OFFSET_BIT), 5 << 8);
    }

    #[test]
    fn parity_shipped_map_applies_compatibility_rules() {
        let Some(model) = testing::piece_model() else {
            return;
        };
        let map = CharMap::parse(&model.charmap).unwrap().unwrap();
        let rewrite = |text: &str| {
            map.longest_rewrite(text.as_bytes())
                .map(|r| r.replacement.to_string())
        };
        assert_eq!(rewrite("ﬁne").as_deref(), Some("fi"));
        assert_eq!(rewrite("Ｆull").as_deref(), Some("F"));
        assert_eq!(rewrite("½").as_deref(), Some("1⁄2"));
        assert_eq!(rewrite("\u{a0}x").as_deref(), Some(" "));
        assert_eq!(rewrite("plain"), None);
    }
}
