use std::{fs, path::Path};

use serde::Serialize;
use serde_json::Value;

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamCollection {
    pub name: String,
    pub app_ids: Vec<String>,
}

pub fn parse_steam_collections(value: Value) -> Vec<SteamCollection> {
    let Some(items) = value.as_array() else {
        return Vec::new();
    };

    items
        .iter()
        .filter_map(|item| {
            let pair = item.as_array()?;
            let key = pair.first()?.as_str()?;
            if !key.starts_with("user-collections.") || key == "user-collections.hidden" {
                return None;
            }
            let encoded = pair.get(1)?.get("value")?.as_str()?;
            let parsed: Value = serde_json::from_str(encoded).ok()?;
            let name = parsed.get("name")?.as_str()?.trim();
            if name.is_empty() {
                return None;
            }
            let added = parsed.get("added")?.as_array()?;
            let app_ids = added
                .iter()
                .filter_map(Value::as_u64)
                .map(|id| id.to_string())
                .collect();
            Some(SteamCollection {
                name: name.to_string(),
                app_ids,
            })
        })
        .collect()
}

pub fn load_from_accounts(librarycache_dir: &Path) -> Vec<SteamCollection> {
    let Some(steam_root) = librarycache_dir.parent().and_then(Path::parent) else {
        return Vec::new();
    };
    let Ok(accounts) = fs::read_dir(steam_root.join("userdata")) else {
        return Vec::new();
    };

    let mut collections = Vec::new();
    for account in accounts.flatten() {
        let path = account
            .path()
            .join("config")
            .join("cloudstorage")
            .join("cloud-storage-namespace-1.json");
        let Ok(content) = fs::read_to_string(path) else {
            continue;
        };
        let Ok(value) = serde_json::from_str(&content) else {
            continue;
        };
        collections.extend(parse_steam_collections(value));
    }
    collections
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn parses_valid_entries_and_skips_hidden_or_malformed_items() {
        let value = serde_json::json!([
            ["user-collections.first", {"value":"{\"name\":\"通关\",\"added\":[10,20,\"bad\"]}"}],
            ["user-collections.hidden", {"value":"{\"name\":\"已隐藏\",\"added\":[30]}"}],
            ["user-collections.broken", {"value":"not-json"}],
            ["showcases.2", {"value":"{}"}]
        ]);
        assert_eq!(
            parse_steam_collections(value),
            vec![SteamCollection {
                name: "通关".into(),
                app_ids: vec!["10".into(), "20".into()],
            }],
        );
    }

    #[test]
    fn malformed_item_does_not_discard_a_later_valid_item() {
        let value = serde_json::json!([
            ["user-collections.bad", {}],
            ["user-collections.good", {"value":"{\"name\":\"收藏\",\"added\":[730]}"}]
        ]);
        assert_eq!(parse_steam_collections(value).len(), 1);
    }

    #[test]
    fn loads_and_concatenates_multiple_account_files() {
        let temp = tempdir().unwrap();
        let librarycache = temp.path().join("appcache").join("librarycache");
        let userdata = temp.path().join("userdata");
        fs::create_dir_all(&librarycache).unwrap();
        for (account, name, app_id) in [("100", "账户一", 10), ("200", "账户二", 20)] {
            let cloud = userdata.join(account).join("config").join("cloudstorage");
            fs::create_dir_all(&cloud).unwrap();
            let entry_value = serde_json::json!({"name": name, "added": [app_id]}).to_string();
            let document = serde_json::json!([
                [format!("user-collections.{account}"), {"value": entry_value}]
            ]);
            fs::write(
                cloud.join("cloud-storage-namespace-1.json"),
                document.to_string(),
            )
            .unwrap();
        }

        let collections = load_from_accounts(&librarycache);
        assert_eq!(collections.len(), 2);
        assert!(collections
            .iter()
            .any(|item| item.name == "账户一" && item.app_ids == ["10"]));
        assert!(collections
            .iter()
            .any(|item| item.name == "账户二" && item.app_ids == ["20"]));
    }
}
