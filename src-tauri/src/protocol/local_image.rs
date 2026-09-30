use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use percent_encoding::percent_decode_str;
use tauri::http;

#[derive(Clone, Default)]
pub struct LocalImageAccess {
    inner: Arc<Mutex<AuthorizedPaths>>,
}

#[derive(Default)]
struct AuthorizedPaths {
    roots: HashSet<PathBuf>,
    files: HashSet<PathBuf>,
}

impl LocalImageAccess {
    pub fn authorize_root(&self, root: &Path) -> Result<PathBuf, String> {
        let canonical = root
            .canonicalize()
            .map_err(|_| "无法读取目录，请检查权限".to_string())?;
        if !canonical.is_dir() {
            return Err("路径不是文件夹".to_string());
        }
        self.inner
            .lock()
            .map_err(|_| "图片授权状态不可用".to_string())?
            .roots
            .insert(canonical.clone());
        Ok(canonical)
    }

    pub fn authorize_file(&self, file: &Path) -> Result<PathBuf, String> {
        let canonical = file
            .canonicalize()
            .map_err(|_| "图片文件不存在".to_string())?;
        if !canonical.is_file() {
            return Err("图片文件不存在".to_string());
        }
        self.inner
            .lock()
            .map_err(|_| "图片授权状态不可用".to_string())?
            .files
            .insert(canonical.clone());
        Ok(canonical)
    }

    pub fn authorized_file(&self, file: &Path) -> Result<PathBuf, String> {
        let canonical = file
            .canonicalize()
            .map_err(|_| "图片文件不存在".to_string())?;
        if !canonical.is_file() {
            return Err("图片文件不存在".to_string());
        }
        if !self.is_authorized(&canonical) {
            return Err("未授权的图片路径".to_string());
        }
        Ok(canonical)
    }

    fn is_authorized(&self, file: &Path) -> bool {
        self.inner.lock().is_ok_and(|paths| {
            paths.files.contains(file) || paths.roots.iter().any(|root| file.starts_with(root))
        })
    }
}

fn status_response(status: u16, message: &str) -> http::Response<Vec<u8>> {
    http::Response::builder()
        .status(status)
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(message.as_bytes().to_vec())
        .unwrap_or_else(|_| http::Response::new(Vec::new()))
}

fn request_path(request: &http::Request<Vec<u8>>) -> Result<PathBuf, String> {
    let encoded = request.uri().path().trim_start_matches('/');
    let decoded = percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|_| "无效图片路径".to_string())?;
    Ok(PathBuf::from(decoded.as_ref()))
}

pub fn handle_request(
    request: http::Request<Vec<u8>>,
    access: &LocalImageAccess,
) -> http::Response<Vec<u8>> {
    let requested = match request_path(&request) {
        Ok(path) => path,
        Err(message) => return status_response(400, &message),
    };
    let canonical = match requested.canonicalize() {
        Ok(path) => path,
        Err(_) => return status_response(404, "图片不存在"),
    };
    if !canonical.is_file() {
        return status_response(404, "图片不存在");
    }
    if !access.is_authorized(&canonical) {
        return status_response(403, "未授权的图片路径");
    }

    match fs::read(&canonical) {
        Ok(bytes) => http::Response::builder()
            .status(200)
            .header(
                "Content-Type",
                mime_guess::from_path(&canonical)
                    .first_or_octet_stream()
                    .as_ref(),
            )
            .header("Access-Control-Allow-Origin", "*")
            .header("Cache-Control", "no-cache")
            .body(bytes)
            .unwrap_or_else(|_| status_response(500, "无法构造图片响应")),
        Err(_) => status_response(500, "无法读取图片"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn authorized_root_accepts_descendants_and_rejects_parent_escape() {
        let temp = tempdir().unwrap();
        let root = temp.path().join("root");
        let inside = root.join("inside.jpg");
        let outside = temp.path().join("outside.jpg");
        fs::create_dir_all(&root).unwrap();
        fs::write(&inside, b"inside").unwrap();
        fs::write(&outside, b"outside").unwrap();
        let access = LocalImageAccess::default();
        access.authorize_root(&root).unwrap();

        assert_eq!(
            access.authorized_file(&inside).unwrap(),
            inside.canonicalize().unwrap()
        );
        assert_eq!(
            access
                .authorized_file(&root.join("..").join("outside.jpg"))
                .unwrap_err(),
            "未授权的图片路径",
        );
    }

    #[cfg(windows)]
    #[test]
    fn directory_symlink_cannot_escape_an_authorized_root() {
        use std::os::windows::fs::symlink_dir;

        let temp = tempdir().unwrap();
        let root = temp.path().join("root");
        let outside = temp.path().join("outside");
        let link = root.join("link");
        fs::create_dir_all(&root).unwrap();
        fs::create_dir_all(&outside).unwrap();
        fs::write(outside.join("secret.jpg"), b"secret").unwrap();
        if symlink_dir(&outside, &link).is_err() {
            return;
        }
        let access = LocalImageAccess::default();
        access.authorize_root(&root).unwrap();

        assert_eq!(
            access
                .authorized_file(&link.join("secret.jpg"))
                .unwrap_err(),
            "未授权的图片路径",
        );
    }
}
