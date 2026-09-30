use std::{
    collections::{HashMap, HashSet},
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    state::AppState,
    steam::{
        app_info::{load_app_info_entries, AppInfoEntry},
        manifest::load_app_names,
    },
};

const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "webp", "gif", "bmp"];
const SCAN_KEYWORDS: &[&str] = &[
    "library_hero.jpg",
    "library_hero_schinese.jpg",
    "library_header.jpg",
    "header_schinese.jpg",
    "library_header_schinese.jpg",
    "header.jpg",
    "logo_schinese.png",
    "library_capsule.jpg",
    "library_capsule_schinese.jpg",
    "library_600x900_schinese.jpg",
    "library_600x900.jpg",
];

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanImagesOptions {
    #[serde(default)]
    pub include_dlc: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageAsset {
    pub name: String,
    pub absolute_path: String,
    pub file_url: String,
    pub extension: String,
    pub size_bytes: u64,
    pub relative_path: String,
    pub group_name: String,
    pub app_id: String,
    pub app_name: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ScanImagesResult {
    pub images: Vec<ImageAsset>,
}

fn app_id_from_relative_path(relative_path: &Path) -> String {
    relative_path
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .find(|segment| {
            !segment.is_empty() && segment.chars().all(|character| character.is_ascii_digit())
        })
        .map(|segment| segment.into_owned())
        .unwrap_or_default()
}

fn is_target_image(path: &Path) -> bool {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    IMAGE_EXTENSIONS.contains(&extension.as_str()) && SCAN_KEYWORDS.contains(&file_name.as_str())
}

fn collect_images(
    root: &Path,
    current: &Path,
    visited: &mut HashSet<PathBuf>,
    images: &mut Vec<ImageAsset>,
    app_info: &HashMap<String, AppInfoEntry>,
    manifest_names: &HashMap<String, String>,
    include_dlc: bool,
) -> Result<(), String> {
    let current = current
        .canonicalize()
        .map_err(|_| "无法读取目录，请检查权限".to_string())?;
    if !current.starts_with(root) || !visited.insert(current.clone()) {
        return Ok(());
    }
    let mut entries = fs::read_dir(&current)
        .map_err(|_| "无法读取目录，请检查权限".to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|_| "无法读取目录，请检查权限".to_string())?;
    entries.sort_by_key(|entry| entry.file_name().to_string_lossy().into_owned());

    for entry in entries {
        let path = entry.path();
        let metadata = entry
            .metadata()
            .map_err(|_| "无法读取目录，请检查权限".to_string())?;
        if metadata.is_dir() {
            collect_images(
                root,
                &path,
                visited,
                images,
                app_info,
                manifest_names,
                include_dlc,
            )?;
            continue;
        }
        if !metadata.is_file() || !is_target_image(&path) {
            continue;
        }
        let canonical_path = path
            .canonicalize()
            .map_err(|_| "无法读取目录，请检查权限".to_string())?;
        if !canonical_path.starts_with(root) {
            continue;
        }

        let relative = canonical_path
            .strip_prefix(root)
            .map_err(|_| "无法计算图片相对路径".to_string())?;
        let app_id = app_id_from_relative_path(relative);
        if !include_dlc
            && app_info
                .get(&app_id)
                .is_some_and(|entry| entry.app_type.eq_ignore_ascii_case("dlc"))
        {
            continue;
        }

        let app_name = app_info
            .get(&app_id)
            .map(|entry| entry.name.clone())
            .filter(|name| !name.is_empty())
            .or_else(|| manifest_names.get(&app_id).cloned())
            .unwrap_or_default();
        let name = canonical_path
            .file_name()
            .map(|value| value.to_string_lossy().into_owned())
            .unwrap_or_default();
        let extension = canonical_path
            .extension()
            .map(|value| format!(".{}", value.to_string_lossy().to_ascii_lowercase()))
            .unwrap_or_default();

        images.push(ImageAsset {
            name: name.clone(),
            absolute_path: canonical_path.to_string_lossy().into_owned(),
            file_url: String::new(),
            extension,
            size_bytes: metadata.len(),
            relative_path: relative.to_string_lossy().into_owned(),
            group_name: name,
            app_id,
            app_name,
        });
    }
    Ok(())
}

#[tauri::command]
pub async fn scan_images(
    state: State<'_, AppState>,
    directory_path: String,
    options: Option<ScanImagesOptions>,
) -> Result<ScanImagesResult, String> {
    let trimmed = directory_path.trim();
    if trimmed.is_empty() {
        return Err("请输入目录路径".to_string());
    }
    let requested = PathBuf::from(trimmed);
    if !requested.exists() {
        return Err("目录不存在".to_string());
    }
    if !requested.is_dir() {
        return Err("路径不是文件夹".to_string());
    }
    let root = requested
        .canonicalize()
        .map_err(|_| "无法读取目录，请检查权限".to_string())?;
    let app_info = load_app_info_entries(&root);
    let manifest_names = load_app_names(&root);
    let mut images = Vec::new();
    let mut visited = HashSet::new();
    collect_images(
        &root,
        &root,
        &mut visited,
        &mut images,
        &app_info,
        &manifest_names,
        options.unwrap_or_default().include_dlc,
    )?;
    state.image_access().authorize_root(&root)?;
    state.remember_librarycache(&root)?;
    images.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(ScanImagesResult { images })
}

#[tauri::command]
pub fn authorize_local_images(
    state: State<'_, AppState>,
    paths: Vec<String>,
) -> Result<Vec<String>, String> {
    paths
        .into_iter()
        .map(|path| {
            state
                .image_access()
                .authorize_file(Path::new(&path))
                .map(|canonical| canonical.to_string_lossy().into_owned())
        })
        .collect()
}
