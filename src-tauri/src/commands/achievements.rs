use std::{collections::HashMap, fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::{commands::settings::load_settings_value, http, state::AppState, storage};

const PLAYER_ACHIEVEMENTS_URL: &str =
    "https://api.steampowered.com/ISteamUserStats/GetPlayerAchievements/v1/";
const SCHEMA_URL: &str = "https://api.steampowered.com/ISteamUserStats/GetSchemaForGame/v2/";

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum AchievementSource {
    Local,
    Api,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Achievement {
    pub id: String,
    pub name: String,
    pub description: String,
    pub icon_url: String,
    pub icon_gray_url: String,
    pub achieved: bool,
    pub unlock_time: Option<u64>,
}

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
pub struct AchievementResult {
    pub source: AchievementSource,
    pub achievements: Vec<Achievement>,
}

#[derive(Debug, Serialize)]
pub struct AchievementCommandResult {
    pub source: AchievementSource,
    pub achievements: Vec<Achievement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct RawPlayerAchievement {
    #[serde(rename = "apiname")]
    api_name: Option<String>,
    achieved: u8,
    name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    #[serde(rename = "icongray")]
    icon_gray: Option<String>,
    #[serde(rename = "unlocktime")]
    unlock_time: u64,
}

#[derive(Deserialize)]
struct PlayerStats {
    success: bool,
    error: Option<String>,
    #[serde(default)]
    achievements: Vec<RawPlayerAchievement>,
}

#[derive(Deserialize)]
struct PlayerEnvelope {
    playerstats: Option<PlayerStats>,
}

#[derive(Clone, Debug, Deserialize)]
struct SchemaAchievement {
    name: String,
    description: Option<String>,
    icon: Option<String>,
    #[serde(rename = "icongray")]
    icon_gray: Option<String>,
}

#[derive(Deserialize)]
struct AvailableGameStats {
    #[serde(default)]
    achievements: Vec<SchemaAchievement>,
}

#[derive(Deserialize)]
struct SchemaGame {
    #[serde(rename = "availableGameStats")]
    available_game_stats: Option<AvailableGameStats>,
}

#[derive(Deserialize)]
struct SchemaEnvelope {
    game: Option<SchemaGame>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AchievementIcon {
    pub id: String,
    pub icon_url: String,
    pub icon_gray_url: String,
}

#[derive(Debug, Serialize)]
pub struct CacheIconsResult {
    pub cached: usize,
    pub skipped: usize,
    pub failed: usize,
    pub directory: String,
}

fn validate_app_id(app_id: &str) -> Result<&str, String> {
    (!app_id.is_empty()
        && app_id.chars().all(|character| character.is_ascii_digit())
        && app_id.parse::<u32>().is_ok())
    .then_some(app_id)
    .ok_or_else(|| "无效的 AppID".to_string())
}

fn parse_achievement(value: &serde_json::Value) -> Option<Achievement> {
    let object = value.as_object()?;
    let id = object.get("id")?.as_str()?.to_string();
    let name = object.get("name")?.as_str()?.to_string();
    let description = object.get("description")?.as_str()?.to_string();
    let icon_url = object.get("iconUrl")?.as_str()?.to_string();
    let icon_gray_url = object.get("iconGrayUrl")?.as_str()?.to_string();
    let achieved = object.get("achieved")?.as_bool()?;
    let unlock_time = match object.get("unlockTime")? {
        serde_json::Value::Null => None,
        value => Some(value.as_u64()?),
    };
    Some(Achievement {
        id,
        name,
        description,
        icon_url,
        icon_gray_url,
        achieved,
        unlock_time,
    })
}

fn parse_achievement_cache(bytes: &[u8]) -> Option<AchievementResult> {
    let value: serde_json::Value = serde_json::from_slice(bytes).ok()?;
    let object = value.as_object()?;
    let source = match object.get("source")?.as_str()? {
        "api" => AchievementSource::Api,
        "local" => AchievementSource::Local,
        _ => return None,
    };
    let achievements = object
        .get("achievements")?
        .as_array()?
        .iter()
        .map(parse_achievement)
        .collect::<Option<Vec<_>>>()?;
    Some(AchievementResult {
        source,
        achievements,
    })
}

fn non_empty(primary: Option<String>, fallback: Option<String>) -> String {
    primary
        .filter(|value| !value.is_empty())
        .or(fallback)
        .unwrap_or_default()
}

fn merge_achievements(
    player: Vec<RawPlayerAchievement>,
    schema: &HashMap<String, SchemaAchievement>,
) -> Vec<Achievement> {
    player
        .into_iter()
        .map(|achievement| {
            let id = achievement.api_name.unwrap_or_default();
            let schema = schema.get(&id);
            Achievement {
                id,
                name: non_empty(achievement.name, schema.map(|entry| entry.name.clone())),
                description: non_empty(
                    achievement.description,
                    schema.and_then(|entry| entry.description.clone()),
                ),
                icon_url: non_empty(
                    achievement.icon,
                    schema.and_then(|entry| entry.icon.clone()),
                ),
                icon_gray_url: non_empty(
                    schema.and_then(|entry| entry.icon_gray.clone()),
                    achievement.icon_gray,
                ),
                achieved: achievement.achieved == 1,
                unlock_time: (achievement.unlock_time > 0).then_some(achievement.unlock_time),
            }
        })
        .collect()
}

async fn fetch_player_achievements(
    client: &reqwest::Client,
    app_id: &str,
    api_key: &str,
    steam_id: &str,
) -> Result<Vec<RawPlayerAchievement>, String> {
    let response = client
        .get(PLAYER_ACHIEVEMENTS_URL)
        .query(&[
            ("key", api_key),
            ("steamid", steam_id),
            ("appid", app_id),
            ("l", "schinese"),
        ])
        .send()
        .await
        .map_err(http::transport_error)?;
    if !response.status().is_success() {
        return Err(http::status_error(response.status()));
    }
    let payload = response
        .json::<PlayerEnvelope>()
        .await
        .map_err(|_| "Steam API 返回无效数据".to_string())?;
    let stats = payload
        .playerstats
        .ok_or_else(|| "Steam API 返回失败".to_string())?;
    if !stats.success {
        return Err(stats
            .error
            .unwrap_or_else(|| "Steam API 返回失败".to_string()));
    }
    Ok(stats.achievements)
}

async fn fetch_schema(
    client: &reqwest::Client,
    app_id: &str,
    api_key: &str,
) -> HashMap<String, SchemaAchievement> {
    let Ok(response) = client
        .get(SCHEMA_URL)
        .query(&[("key", api_key), ("appid", app_id)])
        .send()
        .await
    else {
        return HashMap::new();
    };
    if !response.status().is_success() {
        return HashMap::new();
    }
    let Ok(payload) = response.json::<SchemaEnvelope>().await else {
        return HashMap::new();
    };
    payload
        .game
        .and_then(|game| game.available_game_stats)
        .map(|stats| {
            stats
                .achievements
                .into_iter()
                .map(|achievement| (achievement.name.clone(), achievement))
                .collect()
        })
        .unwrap_or_default()
}

fn achievement_cache_path(app: &AppHandle, app_id: &str) -> Result<PathBuf, String> {
    Ok(storage::data_file(app, "achievements")?.join(format!("{app_id}.json")))
}

fn load_achievement_cache(
    app: &AppHandle,
    app_id: &str,
) -> Result<Option<AchievementResult>, String> {
    let path = achievement_cache_path(app, app_id)?;
    Ok(fs::read(path)
        .ok()
        .and_then(|bytes| parse_achievement_cache(&bytes)))
}

fn save_achievement_cache(
    app: &AppHandle,
    app_id: &str,
    result: &AchievementResult,
) -> Result<(), String> {
    let path = achievement_cache_path(app, app_id)?;
    storage::write_pretty_json(&path, result, "成就缓存")
}

#[tauri::command]
pub async fn fetch_api_achievements(
    app: AppHandle,
    state: State<'_, AppState>,
    app_id: String,
) -> Result<AchievementCommandResult, String> {
    let app_id = validate_app_id(&app_id)?;
    if let Some(cached) = load_achievement_cache(&app, app_id)? {
        return Ok(AchievementCommandResult {
            source: cached.source,
            achievements: cached.achievements,
            error: None,
        });
    }
    let settings = load_settings_value(&app)?;
    if settings.api_key.is_empty() || settings.steam_id.is_empty() {
        return Ok(AchievementCommandResult {
            source: AchievementSource::Api,
            achievements: Vec::new(),
            error: Some("未配置 Web API".to_string()),
        });
    }

    let client = state.http().clone();
    let player_client = client.clone();
    let schema_client = client;
    let schema_key = settings.api_key.clone();
    let (player, schema) = tokio::join!(
        fetch_player_achievements(
            &player_client,
            app_id,
            &settings.api_key,
            &settings.steam_id,
        ),
        fetch_schema(&schema_client, app_id, &schema_key),
    );
    let achievements = match player {
        Ok(player) => merge_achievements(player, &schema),
        Err(error) => {
            return Ok(AchievementCommandResult {
                source: AchievementSource::Api,
                achievements: Vec::new(),
                error: Some(error),
            });
        }
    };
    if !achievements.is_empty() {
        save_achievement_cache(
            &app,
            app_id,
            &AchievementResult {
                source: AchievementSource::Api,
                achievements: achievements.clone(),
            },
        )?;
    }
    Ok(AchievementCommandResult {
        source: AchievementSource::Api,
        achievements,
        error: None,
    })
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

fn sanitize_component(value: &str) -> String {
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
        return "_".to_string();
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

fn validated_icon_url(value: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(value).map_err(|_| "无效的图标地址".to_string())?;
    (url.scheme() == "https")
        .then_some(url)
        .ok_or_else(|| "无效的图标地址".to_string())
}

fn icon_extension(value: &str) -> &'static str {
    let path = reqwest::Url::parse(value)
        .ok()
        .map(|url| url.path().to_ascii_lowercase())
        .unwrap_or_default();
    for extension in [".jpeg", ".jpg", ".png", ".webp", ".gif"] {
        if path.ends_with(extension) {
            return extension;
        }
    }
    ".jpg"
}

fn achievement_icon_directory(
    app: &AppHandle,
    app_id: &str,
    game_name: &str,
) -> Result<PathBuf, String> {
    let app_id = validate_app_id(app_id)?;
    let name = if game_name.trim().is_empty() {
        app_id.to_string()
    } else {
        sanitize_component(game_name)
    };
    Ok(storage::data_file(app, "achievements")?.join(format!("{app_id}_{name}")))
}

#[tauri::command]
pub async fn cache_achievement_icons(
    app: AppHandle,
    state: State<'_, AppState>,
    app_id: String,
    game_name: String,
    icons: Vec<AchievementIcon>,
) -> Result<CacheIconsResult, String> {
    let directory = achievement_icon_directory(&app, &app_id, &game_name)?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建成就缓存目录：{error}"))?;
    let directory = directory
        .canonicalize()
        .map_err(|error| format!("无法读取成就缓存目录：{error}"))?;
    let client = state.http().clone();
    let mut result = CacheIconsResult {
        cached: 0,
        skipped: 0,
        failed: 0,
        directory: directory.to_string_lossy().into_owned(),
    };

    for icon in icons {
        let id = sanitize_component(&icon.id);
        for (url, suffix) in [(&icon.icon_url, ""), (&icon.icon_gray_url, "_gray")] {
            if url.is_empty() {
                continue;
            }
            let Ok(url) = validated_icon_url(url) else {
                result.failed += 1;
                continue;
            };
            let destination =
                directory.join(format!("{id}{suffix}{}", icon_extension(url.as_str())));
            if destination.exists() {
                result.skipped += 1;
                continue;
            }
            let response = match client.get(url).send().await {
                Ok(response) if response.status().is_success() => response,
                _ => {
                    result.failed += 1;
                    continue;
                }
            };
            let bytes = match response.bytes().await {
                Ok(bytes) => bytes,
                Err(_) => {
                    result.failed += 1;
                    continue;
                }
            };
            if fs::write(destination, bytes).is_ok() {
                result.cached += 1;
            } else {
                result.failed += 1;
            }
        }
    }
    Ok(result)
}

#[tauri::command]
pub fn open_achievement_cache_dir(
    app: AppHandle,
    app_id: String,
    game_name: String,
) -> Result<(), String> {
    let directory = achievement_icon_directory(&app, &app_id, &game_name)?;
    fs::create_dir_all(&directory).map_err(|error| format!("无法创建成就缓存目录：{error}"))?;
    let canonical = directory
        .canonicalize()
        .map_err(|error| format!("无法读取成就缓存目录：{error}"))?;
    app.opener()
        .open_path(canonical.to_string_lossy().into_owned(), None::<&str>)
        .map_err(|error| format!("无法打开成就缓存目录：{error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn merges_player_state_with_schema_fallbacks() {
        let player = vec![RawPlayerAchievement {
            api_name: Some("ACH_WIN".into()),
            achieved: 1,
            name: Some("胜利".into()),
            description: None,
            icon: None,
            icon_gray: None,
            unlock_time: 1_700_000_000,
        }];
        let schema = HashMap::from([(
            "ACH_WIN".into(),
            SchemaAchievement {
                name: "Win".into(),
                description: Some("Win once".into()),
                icon: Some("https://cdn.example/icon.jpg".into()),
                icon_gray: Some("https://cdn.example/gray.jpg".into()),
            },
        )]);
        let result = merge_achievements(player, &schema);
        assert_eq!(result[0].name, "胜利");
        assert_eq!(result[0].description, "Win once");
        assert_eq!(result[0].icon_url, "https://cdn.example/icon.jpg");
        assert!(result[0].achieved);
    }

    #[test]
    fn malformed_cached_achievement_invalidates_the_cache() {
        assert!(
            parse_achievement_cache(br#"{"source":"api","achievements":[{"id":7}]}"#,).is_none()
        );
    }

    #[test]
    fn valid_achievement_cache_round_trips() {
        let value = AchievementResult {
            source: AchievementSource::Api,
            achievements: vec![Achievement {
                id: "ACH_WIN".into(),
                name: "Win".into(),
                description: "Win once".into(),
                icon_url: "https://cdn.example/icon.jpg".into(),
                icon_gray_url: "https://cdn.example/gray.jpg".into(),
                achieved: true,
                unlock_time: Some(1_700_000_000),
            }],
        };
        let encoded = serde_json::to_vec(&value).unwrap();
        assert_eq!(parse_achievement_cache(&encoded), Some(value));
    }

    #[test]
    fn sanitizes_path_separators_dot_names_and_windows_devices() {
        assert_eq!(sanitize_component(r#"A<B:C/D\E|F?G*"#), "A_B_C_D_E_F_G_");
        assert_eq!(sanitize_component(".."), "_");
        assert_eq!(sanitize_component("CON"), "CON_");
        assert_eq!(sanitize_component("CON.txt"), "CON_.txt");
        assert_eq!(sanitize_component("name. "), "name");
    }

    #[test]
    fn accepts_https_icons_and_rejects_other_schemes() {
        assert!(validated_icon_url("https://cdn.example/icon.png").is_ok());
        assert!(validated_icon_url("http://cdn.example/icon.png").is_err());
        assert!(validated_icon_url("file:///C:/secret.png").is_err());
    }

    #[test]
    fn extension_is_whitelisted() {
        assert_eq!(icon_extension("https://cdn.example/x.webp"), ".webp");
        assert_eq!(icon_extension("https://cdn.example/x.exe"), ".jpg");
    }

    #[test]
    fn app_id_must_be_numeric_before_it_can_enter_a_cache_path() {
        assert_eq!(validate_app_id("730"), Ok("730"));
        assert_eq!(validate_app_id("../730").unwrap_err(), "无效的 AppID");
        assert_eq!(
            validate_app_id("99999999999999999999").unwrap_err(),
            "无效的 AppID"
        );
    }
}
