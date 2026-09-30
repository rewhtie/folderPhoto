use std::{collections::HashMap, fs};

use tauri::AppHandle;

use crate::storage;

pub type Collections = HashMap<String, Vec<String>>;

fn valid_collections(value: serde_json::Value) -> Option<Collections> {
    let object = value.as_object()?;
    let mut collections = Collections::new();
    for (name, paths) in object {
        let values = paths.as_array()?;
        let mut normalized = Vec::with_capacity(values.len());
        for path in values {
            normalized.push(path.as_str()?.to_string());
        }
        collections.insert(name.clone(), normalized);
    }
    Some(collections)
}

#[tauri::command]
pub fn load_collections(app: AppHandle) -> Result<Collections, String> {
    let path = storage::data_file(&app, "collections.json")?;
    let Ok(content) = fs::read_to_string(path) else {
        return Ok(Collections::new());
    };
    let Ok(value) = serde_json::from_str(&content) else {
        return Ok(Collections::new());
    };
    Ok(valid_collections(value).unwrap_or_default())
}

#[tauri::command]
pub fn save_collections(app: AppHandle, collections: Collections) -> Result<(), String> {
    let path = storage::data_file(&app, "collections.json")?;
    storage::write_pretty_json(&path, &collections, "收藏夹")
}
