use std::{
    collections::HashSet,
    fs,
    path::{Component, Path, PathBuf},
};

use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

use crate::state::AppState;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub copied: usize,
    pub skipped: usize,
    pub failed: Vec<String>,
}

fn is_windows_device_name(value: &str) -> bool {
    let base = value.split('.').next().unwrap_or(value);
    let upper = base.to_ascii_uppercase();
    matches!(upper.as_str(), "CON" | "PRN" | "AUX" | "NUL")
        || upper
            .strip_prefix("COM")
            .or_else(|| upper.strip_prefix("LPT"))
            .is_some_and(|suffix| {
                matches!(suffix, "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9")
            })
}

fn safe_name_component(value: &str) -> String {
    let sanitized = value
        .chars()
        .map(|character| {
            if character.is_control()
                || matches!(
                    character,
                    '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*'
                )
            {
                '_'
            } else {
                character
            }
        })
        .collect::<String>();
    let mut sanitized = sanitized
        .trim()
        .trim_end_matches('.')
        .trim_end()
        .to_string();
    if sanitized.is_empty() || matches!(sanitized.as_str(), "." | "..") {
        return "image".to_string();
    }
    if is_windows_device_name(&sanitized) {
        if let Some(dot) = sanitized.find('.') {
            sanitized.insert(dot, '_');
        } else {
            sanitized.push('_');
        }
    }
    sanitized
}

fn export_name_for(path: &Path) -> String {
    let file_name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    let extension = Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let app_id = path
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => value.to_str(),
            _ => None,
        })
        .find(|segment| {
            !segment.is_empty() && segment.chars().all(|character| character.is_ascii_digit())
        })
        .map(str::to_string)
        .or_else(|| {
            path.parent()
                .and_then(Path::file_name)
                .and_then(|value| value.to_str())
                .map(safe_name_component)
        })
        .unwrap_or_else(|| "image".to_string());
    format!("{app_id}{extension}")
}

fn unique_name(file_name: String, used: &mut HashSet<String>) -> String {
    if used.insert(file_name.clone()) {
        return file_name;
    }
    let path = Path::new(&file_name);
    let base = path
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or("image");
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    let mut counter = 1;
    loop {
        let candidate = format!("{base}_{counter}{extension}");
        if used.insert(candidate.clone()) {
            return candidate;
        }
        counter += 1;
    }
}

fn copy_authorized_images(target_directory: &Path, sources: &[(String, PathBuf)]) -> ExportResult {
    let mut result = ExportResult {
        copied: 0,
        skipped: 0,
        failed: Vec::new(),
    };
    let mut used_names = HashSet::new();

    for (original, source) in sources {
        let destination =
            target_directory.join(unique_name(export_name_for(source), &mut used_names));
        if destination.exists() {
            result.skipped += 1;
            continue;
        }
        match fs::copy(source, destination) {
            Ok(_) => result.copied += 1,
            Err(_) => result.failed.push(original.clone()),
        }
    }
    result
}

#[tauri::command]
pub async fn choose_export_directory(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let selected = app
        .dialog()
        .file()
        .set_title("选择导出目录")
        .blocking_pick_folder();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = selected
        .into_path()
        .map_err(|_| "无法读取所选导出目录".to_string())?;
    let canonical = state.authorize_export_directory(&path)?;
    Ok(Some(canonical.to_string_lossy().into_owned()))
}

#[tauri::command]
pub fn export_images(
    state: State<'_, AppState>,
    target_directory: String,
    absolute_paths: Vec<String>,
) -> Result<ExportResult, String> {
    let target = state.authorized_export_directory(Path::new(&target_directory))?;
    let sources = absolute_paths
        .into_iter()
        .map(|source| {
            state
                .image_access()
                .authorized_file(Path::new(&source))
                .map(|canonical| (source, canonical))
        })
        .collect::<Result<Vec<_>, _>>()?;
    Ok(copy_authorized_images(&target, &sources))
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    #[test]
    fn derives_app_id_names_and_numbers_duplicates() {
        let mut used = HashSet::new();
        let first = unique_name(
            export_name_for(Path::new(r"C:\Steam\10\library_hero.jpg")),
            &mut used,
        );
        let second = unique_name(
            export_name_for(Path::new(r"D:\Other\10\library_hero.jpg")),
            &mut used,
        );
        assert_eq!(first, "10.jpg");
        assert_eq!(second, "10_1.jpg");
    }

    #[test]
    fn falls_back_to_parent_name_when_no_app_id_exists() {
        assert_eq!(
            export_name_for(Path::new(r"C:\Images\Portal\cover.png")),
            "Portal.png",
        );
    }

    #[test]
    fn sanitizes_windows_reserved_fallback_names() {
        assert_eq!(safe_name_component("CON"), "CON_");
        assert_eq!(safe_name_component(".."), "image");
    }

    #[test]
    fn skips_existing_destination_without_overwriting_it() {
        let temp = tempdir().unwrap();
        let source = temp.path().join("source").join("10").join("cover.jpg");
        let target = temp.path().join("target");
        fs::create_dir_all(source.parent().unwrap()).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(&source, b"new").unwrap();
        fs::write(target.join("10.jpg"), b"old").unwrap();

        let result =
            copy_authorized_images(&target, &[(source.to_string_lossy().into_owned(), source)]);

        assert_eq!(result.copied, 0);
        assert_eq!(result.skipped, 1);
        assert!(result.failed.is_empty());
        assert_eq!(fs::read(target.join("10.jpg")).unwrap(), b"old");
    }

    #[test]
    fn one_copy_failure_does_not_stop_later_files() {
        let temp = tempdir().unwrap();
        let missing = temp.path().join("10").join("missing.jpg");
        let valid = temp.path().join("20").join("cover.jpg");
        let target = temp.path().join("target");
        fs::create_dir_all(valid.parent().unwrap()).unwrap();
        fs::create_dir_all(&target).unwrap();
        fs::write(&valid, b"image").unwrap();

        let result = copy_authorized_images(
            &target,
            &[
                (missing.to_string_lossy().into_owned(), missing.clone()),
                (valid.to_string_lossy().into_owned(), valid),
            ],
        );

        assert_eq!(result.copied, 1);
        assert_eq!(result.skipped, 0);
        assert_eq!(result.failed, vec![missing.to_string_lossy().into_owned()]);
        assert_eq!(fs::read(target.join("20.jpg")).unwrap(), b"image");
    }
}
