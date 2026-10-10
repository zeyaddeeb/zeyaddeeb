use anyhow::{bail, Context, Result};

#[derive(Debug, Clone, Copy, PartialEq)]
pub enum Value<'a> {
    Varint(u64),
    Fixed64([u8; 8]),
    Bytes(&'a [u8]),
    Fixed32([u8; 4]),
}

impl<'a> Value<'a> {
    pub fn bytes(self) -> Result<&'a [u8]> {
        match self {
            Self::Bytes(bytes) => Ok(bytes),
            other => bail!("expected a length-delimited field, found {other:?}"),
        }
    }

    pub fn text(self) -> Result<&'a str> {
        Ok(std::str::from_utf8(self.bytes()?)?)
    }

    pub fn float(self) -> Result<f32> {
        match self {
            Self::Fixed32(bytes) => Ok(f32::from_le_bytes(bytes)),
            other => bail!("expected a 32-bit field, found {other:?}"),
        }
    }

    pub fn integer(self) -> Result<u64> {
        match self {
            Self::Varint(value) => Ok(value),
            other => bail!("expected a varint field, found {other:?}"),
        }
    }

    pub fn flag(self) -> Result<bool> {
        Ok(self.integer()? != 0)
    }
}

pub struct Fields<'a> {
    rest: &'a [u8],
}

impl<'a> Fields<'a> {
    pub fn new(message: &'a [u8]) -> Self {
        Self { rest: message }
    }

    fn take(&mut self, count: usize) -> Result<&'a [u8]> {
        let (head, tail) = self
            .rest
            .split_at_checked(count)
            .context("message ends inside a field")?;
        self.rest = tail;
        Ok(head)
    }

    fn varint(&mut self) -> Result<u64> {
        let mut value = 0u64;
        for shift in (0..64).step_by(7) {
            let byte = self.take(1)?[0];
            value |= u64::from(byte & 0x7f) << shift;
            if byte & 0x80 == 0 {
                return Ok(value);
            }
        }
        bail!("varint is longer than ten bytes")
    }

    fn field(&mut self) -> Result<(u32, Value<'a>)> {
        let key = self.varint()?;
        let value = match key & 7 {
            0 => Value::Varint(self.varint()?),
            1 => Value::Fixed64(self.take(8)?.try_into()?),
            2 => {
                let length = self.varint()? as usize;
                Value::Bytes(self.take(length)?)
            }
            5 => Value::Fixed32(self.take(4)?.try_into()?),
            kind => bail!("unsupported wire type {kind}"),
        };
        Ok(((key >> 3) as u32, value))
    }
}

impl<'a> Iterator for Fields<'a> {
    type Item = Result<(u32, Value<'a>)>;

    fn next(&mut self) -> Option<Self::Item> {
        if self.rest.is_empty() {
            return None;
        }
        let field = self.field();
        if field.is_err() {
            self.rest = &[];
        }
        Some(field)
    }
}

#[cfg(test)]
pub mod encode {
    pub fn varint(mut value: u64, out: &mut Vec<u8>) {
        while value >= 0x80 {
            out.push((value as u8 & 0x7f) | 0x80);
            value >>= 7;
        }
        out.push(value as u8);
    }

    pub fn integer(number: u32, value: u64, out: &mut Vec<u8>) {
        varint(u64::from(number) << 3, out);
        varint(value, out);
    }

    pub fn bytes(number: u32, value: &[u8], out: &mut Vec<u8>) {
        varint(u64::from(number) << 3 | 2, out);
        varint(value.len() as u64, out);
        out.extend_from_slice(value);
    }

    pub fn float(number: u32, value: f32, out: &mut Vec<u8>) {
        varint(u64::from(number) << 3 | 5, out);
        out.extend_from_slice(&value.to_le_bytes());
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fields(message: &[u8]) -> Vec<(u32, Value<'_>)> {
        Fields::new(message).collect::<Result<_>>().unwrap()
    }

    #[test]
    fn reads_every_supported_wire_type() {
        let mut message = Vec::new();
        encode::integer(1, 300, &mut message);
        encode::bytes(2, b"piece", &mut message);
        encode::float(3, -1.5, &mut message);
        encode::integer(35, 1, &mut message);
        let parsed = fields(&message);
        assert_eq!(parsed.len(), 4);
        assert_eq!(parsed[0], (1, Value::Varint(300)));
        assert_eq!(parsed[1].1.text().unwrap(), "piece");
        assert_eq!(parsed[2].1.float().unwrap(), -1.5);
        assert_eq!(parsed[3].0, 35);
        assert!(parsed[3].1.flag().unwrap());
    }

    #[test]
    fn reference_encoding_of_150_is_two_bytes() {
        assert_eq!(fields(&[0x08, 0x96, 0x01]), [(1, Value::Varint(150))]);
    }

    #[test]
    fn truncated_messages_are_errors() {
        let mut message = Vec::new();
        encode::bytes(2, b"piece", &mut message);
        message.truncate(message.len() - 1);
        let parsed: Vec<_> = Fields::new(&message).collect();
        assert_eq!(parsed.len(), 1);
        assert!(parsed[0].is_err());
    }

    #[test]
    fn accessors_reject_the_wrong_kind() {
        assert!(Value::Varint(1).bytes().is_err());
        assert!(Value::Bytes(b"x").float().is_err());
        assert!(Value::Fixed32([0; 4]).integer().is_err());
        assert!(Value::Bytes(&[0xff]).text().is_err());
    }
}
