use std::fs;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

use crate::storage;

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SteamSettings {
    pub api_key: String,
    pub steam_id: String,
}

pub fn parse_settings(bytes: &[u8]) -> SteamSettings {
    serde_json::from_slice(bytes).unwrap_or_default()
}

pub fn load_settings_value(app: &AppHandle) -> Result<SteamSettings, String> {
    let path = storage::data_file(app, "settings.json")?;
    Ok(fs::read(path)
        .map(|bytes| parse_settings(&bytes))
        .unwrap_or_default())
}

#[tauri::command]
pub fn load_settings(app: AppHandle) -> Result<SteamSettings, String> {
    load_settings_value(&app)
}

#[tauri::command]
pub fn save_settings(app: AppHandle, settings: SteamSettings) -> Result<(), String> {
    let path = storage::data_file(&app, "settings.json")?;
    storage::write_pretty_json(&path, &settings, "设置")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn invalid_settings_return_empty_strings() {
        assert_eq!(parse_settings(br#"{"apiKey":7}"#), SteamSettings::default());
        assert_eq!(parse_settings(b"not json"), SteamSettings::default());
    }

    #[test]
    fn valid_settings_keep_the_camel_case_fields() {
        assert_eq!(
            parse_settings(br#"{"apiKey":"key","steamId":"76561198000000000"}"#),
            SteamSettings {
                api_key: "key".into(),
                steam_id: "76561198000000000".into(),
            },
        );
        assert_eq!(
            serde_json::to_value(SteamSettings {
                api_key: "key".into(),
                steam_id: "id".into(),
            })
            .unwrap(),
            serde_json::json!({"apiKey":"key","steamId":"id"}),
        );
    }
}
