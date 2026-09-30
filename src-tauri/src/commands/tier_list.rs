use std::fs;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::AppHandle;

use crate::storage;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TierEntry {
    pub id: String,
    pub src: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
pub struct TierList {
    #[serde(rename = "夯")]
    pub top: Vec<TierEntry>,
    #[serde(rename = "顶级")]
    pub elite: Vec<TierEntry>,
    #[serde(rename = "人上人")]
    pub upper: Vec<TierEntry>,
    #[serde(rename = "NPC")]
    pub npc: Vec<TierEntry>,
    #[serde(rename = "拉")]
    pub low: Vec<TierEntry>,
    pub pool: Vec<TierEntry>,
}

fn parse_entry(value: &Value) -> Option<TierEntry> {
    let object = value.as_object()?;
    let id = object.get("id")?.as_str()?.to_string();
    let src = object.get("src")?.as_str()?.to_string();
    let label = object.get("label")?.as_str()?.to_string();
    let app_id = match object.get("appId") {
        None => None,
        Some(value) => Some(value.as_str()?.to_string()),
    };
    Some(TierEntry {
        id,
        src,
        label,
        app_id,
    })
}

fn parse_entries(value: Option<&Value>) -> Vec<TierEntry> {
    value
        .and_then(Value::as_array)
        .map(|entries| entries.iter().filter_map(parse_entry).collect())
        .unwrap_or_default()
}

pub fn normalize_tier_list(value: Value) -> TierList {
    let Some(object) = value.as_object() else {
        return TierList::default();
    };
    TierList {
        top: parse_entries(object.get("夯")),
        elite: parse_entries(object.get("顶级")),
        upper: parse_entries(object.get("人上人")),
        npc: parse_entries(object.get("NPC")),
        low: parse_entries(object.get("拉")),
        pool: parse_entries(object.get("pool")),
    }
}

#[tauri::command]
pub fn load_tier_list(app: AppHandle) -> Result<TierList, String> {
    let path = storage::data_file(&app, "tierList.json")?;
    let Ok(content) = fs::read(path) else {
        return Ok(TierList::default());
    };
    let Ok(value) = serde_json::from_slice(&content) else {
        return Ok(TierList::default());
    };
    Ok(normalize_tier_list(value))
}

#[tauri::command]
pub fn save_tier_list(app: AppHandle, list: Value) -> Result<(), String> {
    let path = storage::data_file(&app, "tierList.json")?;
    storage::write_pretty_json(&path, &normalize_tier_list(list), "排行")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalizes_each_tier_independently() {
        let value = serde_json::json!({
            "夯": [
                {"id":"1","src":"steam-image://one","label":"One","appId":"10"},
                {"id":2,"src":"bad","label":"Bad"}
            ],
            "顶级": "not-an-array",
            "pool": [{"id":"2","src":"data:image/png;base64,x","label":"Two"}],
            "unknown": [{"id":"3","src":"x","label":"Three"}]
        });
        let result = normalize_tier_list(value);
        assert_eq!(result.top.len(), 1);
        assert_eq!(result.top[0].app_id.as_deref(), Some("10"));
        assert!(result.elite.is_empty());
        assert_eq!(result.pool.len(), 1);
        assert!(result.upper.is_empty());
        assert!(result.npc.is_empty());
        assert!(result.low.is_empty());
    }

    #[test]
    fn explicit_null_app_id_is_rejected() {
        let result = normalize_tier_list(serde_json::json!({
            "夯": [{"id":"1","src":"x","label":"One","appId":null}]
        }));
        assert!(result.top.is_empty());
    }

    #[test]
    fn non_object_returns_all_six_empty_tiers() {
        let result = normalize_tier_list(Value::Null);
        assert_eq!(
            serde_json::to_value(result).unwrap(),
            serde_json::json!({
                "夯": [],
                "顶级": [],
                "人上人": [],
                "NPC": [],
                "拉": [],
                "pool": []
            })
        );
    }
}
