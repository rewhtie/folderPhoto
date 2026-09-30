use std::{collections::HashMap, fs, path::Path};

const STEAM_ID64_BASE: u64 = 76_561_197_960_265_728;

pub fn steam_account_id(steam_id: &str) -> Option<String> {
    if steam_id.len() != 17 || !steam_id.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    let account_id = steam_id.parse::<u64>().ok()?.checked_sub(STEAM_ID64_BASE)?;
    u32::try_from(account_id)
        .ok()
        .map(|value| value.to_string())
}

fn skip_whitespace(bytes: &[u8], cursor: &mut usize) {
    while bytes.get(*cursor).is_some_and(u8::is_ascii_whitespace) {
        *cursor += 1;
    }
}

fn quoted_value<'a>(content: &'a str, cursor: &mut usize) -> Option<&'a str> {
    let bytes = content.as_bytes();
    skip_whitespace(bytes, cursor);
    if bytes.get(*cursor) != Some(&b'"') {
        return None;
    }
    *cursor += 1;
    let start = *cursor;
    while *cursor < bytes.len() {
        match bytes[*cursor] {
            b'"' => {
                let value = &content[start..*cursor];
                *cursor += 1;
                return Some(value);
            }
            b'\\' => {
                *cursor = (*cursor).saturating_add(2);
            }
            _ => *cursor += 1,
        }
    }
    None
}

fn block_at(content: &str, open_brace: usize) -> Option<(&str, usize)> {
    let bytes = content.as_bytes();
    if bytes.get(open_brace) != Some(&b'{') {
        return None;
    }
    let start = open_brace + 1;
    let mut cursor = start;
    let mut depth = 1usize;
    let mut in_string = false;
    let mut escaped = false;
    while cursor < bytes.len() {
        let byte = bytes[cursor];
        if in_string {
            if escaped {
                escaped = false;
            } else if byte == b'\\' {
                escaped = true;
            } else if byte == b'"' {
                in_string = false;
            }
        } else if byte == b'"' {
            in_string = true;
        } else if byte == b'{' {
            depth += 1;
        } else if byte == b'}' {
            depth -= 1;
            if depth == 0 {
                return Some((&content[start..cursor], cursor + 1));
            }
        }
        cursor += 1;
    }
    None
}

fn named_block<'a>(content: &'a str, key: &str) -> Option<&'a str> {
    let mut cursor = 0;
    while cursor < content.len() {
        let start = cursor;
        let Some(candidate) = quoted_value(content, &mut cursor) else {
            cursor = start + 1;
            continue;
        };
        skip_whitespace(content.as_bytes(), &mut cursor);
        if candidate.eq_ignore_ascii_case(key) {
            return block_at(content, cursor).map(|(block, _)| block);
        }
    }
    None
}

pub fn parse_local_playtimes(content: &str) -> HashMap<u32, u32> {
    let Some(apps) = named_block(content, "apps") else {
        return HashMap::new();
    };
    let mut playtimes = HashMap::new();
    let mut cursor = 0;
    while cursor < apps.len() {
        let start = cursor;
        let Some(app_id_text) = quoted_value(apps, &mut cursor) else {
            cursor = start + 1;
            continue;
        };
        skip_whitespace(apps.as_bytes(), &mut cursor);
        let Some((app_block, next_cursor)) = block_at(apps, cursor) else {
            cursor = start + 1;
            continue;
        };
        cursor = next_cursor;
        let Ok(app_id) = app_id_text.parse::<u32>() else {
            continue;
        };

        let mut field_cursor = 0;
        while field_cursor < app_block.len() {
            let field_start = field_cursor;
            let Some(key) = quoted_value(app_block, &mut field_cursor) else {
                field_cursor = field_start + 1;
                continue;
            };
            let Some(value) = quoted_value(app_block, &mut field_cursor) else {
                continue;
            };
            if key.eq_ignore_ascii_case("Playtime") {
                if let Ok(minutes) = value.parse() {
                    playtimes.insert(app_id, minutes);
                }
                break;
            }
        }
    }
    playtimes
}

pub fn load_local_playtimes(librarycache: &Path, steam_id: &str) -> HashMap<u32, u32> {
    let Some(account_id) = steam_account_id(steam_id) else {
        return HashMap::new();
    };
    let Some(steam_root) = librarycache.parent().and_then(Path::parent) else {
        return HashMap::new();
    };
    let path = steam_root
        .join("userdata")
        .join(account_id)
        .join("config")
        .join("localconfig.vdf");
    fs::read_to_string(path)
        .map(|content| parse_local_playtimes(&content))
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_valid_steam_id_and_rejects_invalid_values() {
        assert_eq!(
            steam_account_id("76561198873178117"),
            Some("912912389".into())
        );
        assert_eq!(steam_account_id("invalid"), None);
        assert_eq!(steam_account_id("76561197960265727"), None);
    }

    #[test]
    fn parses_only_playtime_inside_the_apps_block() {
        let content = r#"
            "outside" { "550" { "Playtime" "999" } }
            "apps" {
              "550" { "LastPlayed" "1" "Playtime" "2011" }
              "1449850" { "Playtime" "67796" }
            }
        "#;
        assert_eq!(parse_local_playtimes(content).get(&550), Some(&2011));
        assert_eq!(
            parse_local_playtimes(content).get(&1_449_850),
            Some(&67_796)
        );
    }

    #[test]
    fn unterminated_apps_block_returns_no_playtimes() {
        assert!(parse_local_playtimes(r#""apps" { "550" { "Playtime" "10" }"#).is_empty());
    }
}
