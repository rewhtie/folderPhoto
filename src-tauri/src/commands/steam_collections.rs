use std::path::Path;

use tauri::State;

use crate::{
    state::AppState,
    steam::collections::{load_from_accounts, SteamCollection},
};

#[tauri::command]
pub fn load_steam_collections(
    state: State<'_, AppState>,
    librarycache_dir: String,
) -> Result<Vec<SteamCollection>, String> {
    let trimmed = librarycache_dir.trim();
    if trimmed.is_empty() {
        return Err("请输入目录路径".to_string());
    }
    let librarycache = state.authorized_librarycache(Path::new(trimmed))?;
    Ok(load_from_accounts(&librarycache))
}
