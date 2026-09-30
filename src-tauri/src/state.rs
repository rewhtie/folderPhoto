use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::Duration,
};

use crate::protocol::local_image::LocalImageAccess;

pub const DEFAULT_LIBRARYCACHE: &str = r"C:\Program Files (x86)\Steam\appcache\librarycache";

pub struct AppState {
    image_access: LocalImageAccess,
    http: reqwest::Client,
    session: Mutex<SessionState>,
}

#[derive(Default)]
struct SessionState {
    recent_librarycache: Option<PathBuf>,
    export_directories: HashSet<PathBuf>,
}

impl AppState {
    pub fn new() -> Result<Self, String> {
        let http = reqwest::Client::builder()
            .user_agent(concat!(
                "SteamImageBrowser-Tauri/",
                env!("CARGO_PKG_VERSION")
            ))
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|_| "无法初始化网络客户端".to_string())?;

        Ok(Self {
            image_access: LocalImageAccess::default(),
            http,
            session: Mutex::new(SessionState::default()),
        })
    }

    pub fn image_access(&self) -> &LocalImageAccess {
        &self.image_access
    }

    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    pub fn remember_librarycache(&self, path: &Path) -> Result<(), String> {
        let canonical = canonical_directory(path, "无法读取目录，请检查权限")?;
        self.session
            .lock()
            .map_err(|_| "应用状态不可用".to_string())?
            .recent_librarycache = Some(canonical);
        Ok(())
    }

    pub fn librarycache_path(&self) -> Result<PathBuf, String> {
        Ok(self
            .session
            .lock()
            .map_err(|_| "应用状态不可用".to_string())?
            .recent_librarycache
            .clone()
            .unwrap_or_else(|| PathBuf::from(DEFAULT_LIBRARYCACHE)))
    }

    pub fn authorized_librarycache(&self, requested: &Path) -> Result<PathBuf, String> {
        let canonical = requested
            .canonicalize()
            .map_err(|_| "未授权的 Steam 图片目录".to_string())?;
        if !canonical.is_dir() {
            return Err("未授权的 Steam 图片目录".to_string());
        }

        let recent = self
            .session
            .lock()
            .map_err(|_| "应用状态不可用".to_string())?
            .recent_librarycache
            .clone();
        if recent.as_ref() == Some(&canonical) {
            return Ok(canonical);
        }

        let default = PathBuf::from(DEFAULT_LIBRARYCACHE);
        if default
            .canonicalize()
            .is_ok_and(|default| default == canonical)
        {
            return Ok(canonical);
        }

        Err("未授权的 Steam 图片目录".to_string())
    }

    pub fn authorize_export_directory(&self, path: &Path) -> Result<PathBuf, String> {
        fs::create_dir_all(path).map_err(|error| format!("无法创建导出目录：{error}"))?;
        let canonical = canonical_directory(path, "无法读取导出目录")?;
        self.session
            .lock()
            .map_err(|_| "应用状态不可用".to_string())?
            .export_directories
            .insert(canonical.clone());
        Ok(canonical)
    }

    pub fn authorized_export_directory(&self, path: &Path) -> Result<PathBuf, String> {
        let canonical = path
            .canonicalize()
            .map_err(|_| "未授权的导出目录".to_string())?;
        if !canonical.is_dir() {
            return Err("未授权的导出目录".to_string());
        }
        let authorized = self
            .session
            .lock()
            .map_err(|_| "应用状态不可用".to_string())?
            .export_directories
            .contains(&canonical);
        authorized
            .then_some(canonical)
            .ok_or_else(|| "未授权的导出目录".to_string())
    }
}

fn canonical_directory(path: &Path, message: &str) -> Result<PathBuf, String> {
    let canonical = path.canonicalize().map_err(|_| message.to_string())?;
    canonical
        .is_dir()
        .then_some(canonical)
        .ok_or_else(|| message.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn successful_librarycache_replaces_the_default_for_the_session() {
        let temp = tempdir().unwrap();
        let librarycache = temp.path().join("appcache").join("librarycache");
        fs::create_dir_all(&librarycache).unwrap();
        let state = AppState::new().unwrap();

        state.remember_librarycache(&librarycache).unwrap();

        assert_eq!(
            state.librarycache_path().unwrap(),
            librarycache.canonicalize().unwrap()
        );
    }

    #[test]
    fn export_directory_authorization_requires_the_exact_canonical_directory() {
        let temp = tempdir().unwrap();
        let allowed = temp.path().join("allowed");
        let allowed_copy = temp.path().join("allowed-copy");
        fs::create_dir_all(&allowed).unwrap();
        fs::create_dir_all(&allowed_copy).unwrap();
        let state = AppState::new().unwrap();

        state.authorize_export_directory(&allowed).unwrap();

        assert!(state.authorized_export_directory(&allowed).is_ok());
        assert!(state.authorized_export_directory(&allowed_copy).is_err());
    }

    #[test]
    fn remembered_librarycache_is_authorized_but_another_directory_is_not() {
        let temp = tempdir().unwrap();
        let allowed = temp.path().join("allowed");
        let other = temp.path().join("other");
        fs::create_dir_all(&allowed).unwrap();
        fs::create_dir_all(&other).unwrap();
        let state = AppState::new().unwrap();
        state.remember_librarycache(&allowed).unwrap();

        assert_eq!(
            state.authorized_librarycache(&allowed).unwrap(),
            allowed.canonicalize().unwrap(),
        );
        assert_eq!(
            state.authorized_librarycache(&other).unwrap_err(),
            "未授权的 Steam 图片目录",
        );
    }
}
