//! Tri naturel des noms de fichiers.

use std::cmp::Ordering;
use std::iter::Peekable;
use std::str::Chars;

/// Compare deux chaînes dans l'ordre « naturel » : les suites de chiffres sont
/// comparées comme des nombres (`page2` < `page10`) et les lettres sans tenir
/// compte de la casse.
///
/// À égalité naturelle (`p01` et `p1`), l'ordre binaire départage les deux
/// chaînes pour garantir un ordre total et stable.
pub fn natural_cmp(a: &str, b: &str) -> Ordering {
    let mut left = a.chars().peekable();
    let mut right = b.chars().peekable();
    loop {
        match (left.peek().copied(), right.peek().copied()) {
            (None, None) => return a.cmp(b),
            (None, Some(_)) => return Ordering::Less,
            (Some(_), None) => return Ordering::Greater,
            (Some(x), Some(y)) if x.is_ascii_digit() && y.is_ascii_digit() => {
                let ord = cmp_numbers(&take_digits(&mut left), &take_digits(&mut right));
                if ord != Ordering::Equal {
                    return ord;
                }
            }
            (Some(x), Some(y)) => {
                let ord = x.to_lowercase().cmp(y.to_lowercase());
                if ord != Ordering::Equal {
                    return ord;
                }
                left.next();
                right.next();
            }
        }
    }
}

fn take_digits(chars: &mut Peekable<Chars<'_>>) -> String {
    let mut digits = String::new();
    while let Some(c) = chars.next_if(char::is_ascii_digit) {
        digits.push(c);
    }
    digits
}

/// Compare deux suites de chiffres ASCII sans conversion (pas de dépassement).
fn cmp_numbers(a: &str, b: &str) -> Ordering {
    let a = a.trim_start_matches('0');
    let b = b.trim_start_matches('0');
    a.len().cmp(&b.len()).then_with(|| a.cmp(b))
}

#[cfg(test)]
mod tests {
    use super::natural_cmp;
    use std::cmp::Ordering;

    #[test]
    fn numbers_are_compared_numerically() {
        assert_eq!(natural_cmp("page2", "page10"), Ordering::Less);
        assert_eq!(natural_cmp("page10", "page2"), Ordering::Greater);
        assert_eq!(natural_cmp("p9.jpg", "p10.jpg"), Ordering::Less);
    }

    #[test]
    fn case_is_ignored_before_tie_break() {
        assert_eq!(natural_cmp("Page2", "page10"), Ordering::Less);
        assert_eq!(natural_cmp("a", "B"), Ordering::Less);
    }

    #[test]
    fn leading_zeros_tie_break_is_stable() {
        assert_ne!(natural_cmp("p01", "p1"), Ordering::Equal);
        assert_eq!(natural_cmp("p1", "p1"), Ordering::Equal);
        assert_eq!(natural_cmp("p001", "p2"), Ordering::Less);
    }

    #[test]
    fn huge_numbers_do_not_overflow() {
        let big = "x99999999999999999999999999999";
        assert_eq!(natural_cmp("x1", big), Ordering::Less);
    }

    #[test]
    fn sorts_a_list() {
        let mut names = vec!["p10", "p2", "p1", "P3", "p12", "p11"];
        names.sort_by(|a, b| natural_cmp(a, b));
        assert_eq!(names, ["p1", "p2", "P3", "p10", "p11", "p12"]);
    }

    #[test]
    fn prefix_is_smaller() {
        assert_eq!(natural_cmp("ch1", "ch1/p1"), Ordering::Less);
    }
}
