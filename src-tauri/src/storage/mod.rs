use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::Serialize;
use tauri::{AppHandle, Manager};

pub fn data_file(app: &AppHandle, file_name: &str) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|directory| directory.join(file_name))
        .map_err(|error| format!("无法确定应用数据目录：{error}"))
}

pub fn write_pretty_json<T: Serialize>(path: &Path, value: &T, label: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| format!("无法创建{label}目录：{error}"))?;
    }
    let content = serde_json::to_string_pretty(value)
        .map_err(|error| format!("无法序列化{label}：{error}"))?;
    fs::write(path, content).map_err(|error| format!("无法保存{label}：{error}"))
}
