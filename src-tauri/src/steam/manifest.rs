use std::{collections::HashMap, fs, path::Path};

pub fn parse_app_name(content: &str) -> Option<String> {
    for line in content.lines() {
        let trimmed = line.trim();
        let Some(rest) = trimmed.strip_prefix('"') else {
            continue;
        };
        let Some((key, rest)) = rest.split_once('"') else {
            continue;
        };
        if !key.eq_ignore_ascii_case("name") {
            continue;
        }
        let value = rest.trim_start();
        let Some(value) = value.strip_prefix('"') else {
            continue;
        };
        let Some((name, _)) = value.split_once('"') else {
            continue;
        };
        return Some(name.to_string());
    }
    None
}

pub fn load_app_names(librarycache_dir: &Path) -> HashMap<String, String> {
    let Some(steam_root) = librarycache_dir.parent().and_then(Path::parent) else {
        return HashMap::new();
    };
    let steam_apps_dir = steam_root.join("steamapps");
    let Ok(entries) = fs::read_dir(steam_apps_dir) else {
        return HashMap::new();
    };

    let mut names = HashMap::new();
    for entry in entries.flatten() {
        let file_name = entry.file_name().to_string_lossy().into_owned();
        let lower = file_name.to_ascii_lowercase();
        let Some(app_id) = lower
            .strip_prefix("appmanifest_")
            .and_then(|value| value.strip_suffix(".acf"))
            .filter(|value| {
                !value.is_empty() && value.chars().all(|character| character.is_ascii_digit())
            })
        else {
            continue;
        };
        let Ok(content) = fs::read_to_string(entry.path()) else {
            continue;
        };
        if let Some(name) = parse_app_name(&content) {
            names.insert(app_id.to_string(), name);
        }
    }
    names
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_name_case_insensitively() {
        assert_eq!(
            parse_app_name("\"AppState\"\n{\n  \"NaMe\"  \"示例游戏\"\n}"),
            Some("示例游戏".to_string())
        );
    }

    #[test]
    fn returns_none_without_name() {
        assert_eq!(parse_app_name("\"appid\" \"10\""), None);
    }
}
