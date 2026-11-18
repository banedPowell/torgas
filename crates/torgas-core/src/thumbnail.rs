//! Miniatures de couverture.

use std::io::Cursor;

use image::codecs::jpeg::JpegEncoder;
use image::imageops::FilterType;

use crate::cbz::Page;
use crate::error::{CoreError, Result};

/// Largeur maximale d'une miniature, en pixels.
pub const MAX_THUMBNAIL_WIDTH: u32 = 360;

/// Qualité JPEG des miniatures (compromis taille/netteté pour une grille).
const JPEG_QUALITY: u8 = 82;

/// Génère une miniature JPEG d'au plus `max_width` pixels de large (borné à
/// [`MAX_THUMBNAIL_WIDTH`]), en conservant les proportions. Une image plus
/// étroite n'est pas agrandie.
///
/// Formats d'entrée : JPEG, PNG, WebP et GIF (première image). L'AVIF n'est
/// pas décodé (décodeur non pur Rust) et renvoie une erreur.
///
/// Le JPEG est préféré au WebP : l'encodeur WebP pur Rust ne fait que du
/// sans perte, bien plus lourd pour des photos de couverture.
pub fn make(bytes: &[u8], max_width: u32) -> Result<Page> {
    if max_width == 0 {
        return Err(CoreError::InvalidValue(
            "largeur de miniature nulle".to_owned(),
        ));
    }
    let max_width = max_width.min(MAX_THUMBNAIL_WIDTH);
    let image = image::load_from_memory(bytes)?;
    let image = if image.width() > max_width {
        let height = (u64::from(image.height()) * u64::from(max_width))
            .div_ceil(u64::from(image.width()))
            .max(1);
        let height = u32::try_from(height).unwrap_or(u32::MAX);
        image.resize_exact(max_width, height, FilterType::Triangle)
    } else {
        image
    };

    let mut out = Cursor::new(Vec::new());
    let encoder = JpegEncoder::new_with_quality(&mut out, JPEG_QUALITY);
    image.into_rgb8().write_with_encoder(encoder)?;
    Ok(Page {
        mime: "image/jpeg".to_owned(),
        bytes: out.into_inner(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fixtures;

    fn decode(page: &Page) -> image::DynamicImage {
        image::load_from_memory(&page.bytes).unwrap()
    }

    #[test]
    fn shrinks_wide_images_keeping_ratio() {
        let png = fixtures::png_of_size(800, 1200);
        let thumb = make(&png, 400).unwrap();
        assert_eq!(thumb.mime, "image/jpeg");
        let img = decode(&thumb);
        assert_eq!((img.width(), img.height()), (360, 540));
    }

    #[test]
    fn respects_smaller_max_width() {
        let png = fixtures::png_of_size(800, 400);
        let img = decode(&make(&png, 200).unwrap());
        assert_eq!((img.width(), img.height()), (200, 100));
    }

    #[test]
    fn does_not_upscale() {
        let png = fixtures::png_of_size(120, 90);
        let img = decode(&make(&png, 360).unwrap());
        assert_eq!((img.width(), img.height()), (120, 90));
    }

    #[test]
    fn decodes_jpeg_input() {
        let jpeg = fixtures::real_jpeg(500, 700);
        let img = decode(&make(&jpeg, 360).unwrap());
        assert_eq!(img.width(), 360);
    }

    #[test]
    fn rejects_garbage_and_zero_width() {
        assert!(matches!(make(b"nope", 100), Err(CoreError::Image(_))));
        assert!(matches!(
            make(&fixtures::png_bytes(), 0),
            Err(CoreError::InvalidValue(_))
        ));
    }
}
