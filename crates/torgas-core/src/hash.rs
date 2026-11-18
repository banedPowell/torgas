//! Empreintes de fichiers.

use std::fmt::Write as _;

use sha2::{Digest, Sha256};

/// Calcule l'empreinte SHA-256 de `bytes`, en hexadécimal minuscule (64 caractères).
///
/// Sert de clé de dédoublonnage à l'import.
pub fn sha256(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut out = String::with_capacity(digest.len() * 2);
    for byte in &digest {
        // L'écriture dans une `String` ne peut pas échouer.
        let _ = write!(out, "{byte:02x}");
    }
    out
}

#[cfg(test)]
mod tests {
    use super::sha256;

    #[test]
    fn empty_input() {
        assert_eq!(
            sha256(b""),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn known_vector() {
        assert_eq!(
            sha256(b"abc"),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
    }
}
