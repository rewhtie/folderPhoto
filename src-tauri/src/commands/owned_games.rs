use std::{
    collections::{HashMap, HashSet},
    fs,
    path::Path,
};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::{
    commands::settings::load_settings_value,
    http,
    state::AppState,
    steam::{
        app_info::{load_app_info_entries, AppInfoEntry},
        local_config::load_local_playtimes,
    },
    storage,
};

const OWNED_GAMES_URL: &str = "https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/";
const RECENTLY_PLAYED_URL: &str =
    "https://api.steampowered.com/IPlayerService/GetRecentlyPlayedGames/v1/";

#[derive(Clone, Debug, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OwnedGame {
    pub appid: u32,
    pub name: String,
    pub playtime_forever: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_family: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct OwnedGamesResult {
    pub games: Vec<OwnedGame>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Deserialize)]
struct RawOwnedGame {
    appid: u32,
    #[serde(default)]
    name: String,
    #[serde(default)]
    playtime_forever: u32,
}

#[derive(Deserialize)]
struct OwnedGamesResponse {
    #[serde(default)]
    games: Vec<RawOwnedGame>,
}

#[derive(Deserialize)]
struct OwnedGamesEnvelope {
    #[serde(default)]
    response: Option<OwnedGamesResponse>,
}

#[derive(Deserialize)]
struct RawRecentGame {
    appid: u32,
    playtime_forever: Option<u32>,
}

#[derive(Deserialize)]
struct RecentlyPlayedResponse {
    #[serde(default)]
    games: Vec<RawRecentGame>,
}

#[derive(Deserialize)]
struct RecentlyPlayedEnvelope {
    #[serde(default)]
    response: Option<RecentlyPlayedResponse>,
}

fn parse_owned_games_response(value: Value) -> Vec<OwnedGame> {
    serde_json::from_value::<OwnedGamesEnvelope>(value)
        .ok()
        .and_then(|envelope| envelope.response)
        .map(|response| {
            response
                .games
                .into_iter()
                .map(|game| OwnedGame {
                    appid: game.appid,
                    name: game.name,
                    playtime_forever: game.playtime_forever,
                    is_family: None,
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_recently_played_response(value: Value) -> HashMap<u32, u32> {
    serde_json::from_value::<RecentlyPlayedEnvelope>(value)
        .ok()
        .and_then(|envelope| envelope.response)
        .map(|response| {
            response
                .games
                .into_iter()
                .filter_map(|game| game.playtime_forever.map(|minutes| (game.appid, minutes)))
                .collect()
        })
        .unwrap_or_default()
}

fn scan_librarycache_app_ids(path: &Path) -> Vec<u32> {
    let Ok(entries) = fs::read_dir(path) else {
        return Vec::new();
    };
    entries
        .flatten()
        .filter_map(|entry| {
            entry
                .file_type()
                .ok()
                .filter(|file_type| file_type.is_dir())
                .and_then(|_| {
                    entry
                        .file_name()
                        .to_str()
                        .and_then(|name| name.parse().ok())
                })
        })
        .collect()
}

fn merge_with_librarycache(
    api_games: Vec<OwnedGame>,
    librarycache_app_ids: &[u32],
    app_info: &HashMap<String, AppInfoEntry>,
) -> Vec<OwnedGame> {
    let api_ids: HashSet<u32> = api_games.iter().map(|game| game.appid).collect();
    let mut games = api_games
        .into_iter()
        .filter(|game| {
            app_info
                .get(&game.appid.to_string())
                .map_or(true, |info| !info.app_type.eq_ignore_ascii_case("dlc"))
        })
        .collect::<Vec<_>>();
    games.extend(
        librarycache_app_ids
            .iter()
            .copied()
            .filter(|app_id| !api_ids.contains(app_id))
            .filter(|app_id| {
                app_info
                    .get(&app_id.to_string())
                    .map_or(true, |info| !info.app_type.eq_ignore_ascii_case("dlc"))
            })
            .map(|appid| OwnedGame {
                appid,
                name: app_info
                    .get(&appid.to_string())
                    .map(|info| info.name.clone())
                    .unwrap_or_default(),
                playtime_forever: 0,
                is_family: Some(true),
            }),
    );
    games
}

fn fill_missing_playtimes(
    mut games: Vec<OwnedGame>,
    playtimes: &HashMap<u32, u32>,
) -> Vec<OwnedGame> {
    for game in &mut games {
        if game.playtime_forever == 0 {
            if let Some(minutes) = playtimes.get(&game.appid).filter(|minutes| **minutes > 0) {
                game.playtime_forever = *minutes;
            }
        }
    }
    games
}

fn merge_recent_playtimes(
    games: Vec<OwnedGame>,
    recent_playtimes: &HashMap<u32, u32>,
) -> Vec<OwnedGame> {
    fill_missing_playtimes(games, recent_playtimes)
}

fn merge_local_playtimes(
    games: Vec<OwnedGame>,
    local_playtimes: &HashMap<u32, u32>,
) -> Vec<OwnedGame> {
    fill_missing_playtimes(games, local_playtimes)
}

fn parse_owned_game(value: &Value) -> Option<OwnedGame> {
    let object = value.as_object()?;
    let appid = u32::try_from(object.get("appid")?.as_u64()?).ok()?;
    let name = object.get("name")?.as_str()?.to_string();
    let playtime_forever = u32::try_from(object.get("playtimeForever")?.as_u64()?).ok()?;
    let is_family = match object.get("isFamily") {
        None => None,
        Some(value) => Some(value.as_bool()?),
    };
    Some(OwnedGame {
        appid,
        name,
        playtime_forever,
        is_family,
    })
}

fn parse_owned_games_cache(bytes: &[u8]) -> Option<Vec<OwnedGame>> {
    let value: Value = serde_json::from_slice(bytes).ok()?;
    value.as_array()?.iter().map(parse_owned_game).collect()
}

fn load_cached_owned_games(app: &AppHandle) -> Result<Option<Vec<OwnedGame>>, String> {
    let path = storage::data_file(app, "owned-games.json")?;
    Ok(fs::read(path)
        .ok()
        .and_then(|bytes| parse_owned_games_cache(&bytes)))
}

fn save_owned_games_cache(app: &AppHandle, games: &[OwnedGame]) -> Result<(), String> {
    let path = storage::data_file(app, "owned-games.json")?;
    storage::write_pretty_json(&path, &games, "游戏缓存")
}

async fn fetch_owned_api(
    client: &reqwest::Client,
    api_key: &str,
    steam_id: &str,
) -> Result<Vec<OwnedGame>, String> {
    let response = client
        .get(OWNED_GAMES_URL)
        .query(&[
            ("key", api_key),
            ("steamid", steam_id),
            ("include_appinfo", "true"),
            ("include_played_free_games", "true"),
            ("format", "json"),
        ])
        .send()
        .await
        .map_err(http::transport_error)?;
    if !response.status().is_success() {
        return Err(http::status_error(response.status()));
    }
    let value = response
        .json::<Value>()
        .await
        .map_err(|_| "Steam API 返回无效数据".to_string())?;
    Ok(parse_owned_games_response(value))
}

async fn fetch_recently_played(
    client: &reqwest::Client,
    api_key: &str,
    steam_id: &str,
) -> HashMap<u32, u32> {
    let Ok(response) = client
        .get(RECENTLY_PLAYED_URL)
        .query(&[("key", api_key), ("steamid", steam_id), ("format", "json")])
        .send()
        .await
    else {
        return HashMap::new();
    };
    if !response.status().is_success() {
        return HashMap::new();
    }
    response
        .json::<Value>()
        .await
        .map(parse_recently_played_response)
        .unwrap_or_default()
}

#[tauri::command]
pub async fn fetch_owned_games(
    app: AppHandle,
    state: State<'_, AppState>,
    force: Option<bool>,
) -> Result<OwnedGamesResult, String> {
    let librarycache = state.librarycache_path()?;
    let settings = load_settings_value(&app)?;

    if !force.unwrap_or(false) {
        if let Some(cached) = load_cached_owned_games(&app)? {
            let local = load_local_playtimes(&librarycache, &settings.steam_id);
            let games = merge_local_playtimes(cached, &local);
            save_owned_games_cache(&app, &games)?;
            return Ok(OwnedGamesResult { games, error: None });
        }
    }

    if settings.api_key.is_empty() || settings.steam_id.is_empty() {
        return Ok(OwnedGamesResult {
            games: Vec::new(),
            error: Some("未配置 Web API".to_string()),
        });
    }

    let client = state.http().clone();
    let owned_client = client.clone();
    let recent_client = client;
    let api_key = settings.api_key;
    let steam_id = settings.steam_id;
    let owned_api_key = api_key.clone();
    let owned_steam_id = steam_id.clone();
    let local_librarycache = librarycache.clone();
    let local_steam_id = steam_id.clone();

    let owned_future =
        async move { fetch_owned_api(&owned_client, &owned_api_key, &owned_steam_id).await };
    let recent_future =
        async move { fetch_recently_played(&recent_client, &api_key, &steam_id).await };
    let local_future = tauri::async_runtime::spawn_blocking(move || {
        let app_ids = scan_librarycache_app_ids(&local_librarycache);
        let app_info = load_app_info_entries(&local_librarycache);
        let playtimes = load_local_playtimes(&local_librarycache, &local_steam_id);
        (app_ids, app_info, playtimes)
    });

    let (owned_result, recent_playtimes, local_result) =
        tokio::join!(owned_future, recent_future, local_future);
    let owned_games = match owned_result {
        Ok(games) => games,
        Err(error) => {
            return Ok(OwnedGamesResult {
                games: Vec::new(),
                error: Some(error),
            });
        }
    };
    let (app_ids, app_info, local_playtimes) =
        local_result.map_err(|_| "无法读取本地 Steam 数据".to_string())?;
    let games = merge_local_playtimes(
        merge_recent_playtimes(
            merge_with_librarycache(owned_games, &app_ids, &app_info),
            &recent_playtimes,
        ),
        &local_playtimes,
    );
    save_owned_games_cache(&app, &games)?;
    Ok(OwnedGamesResult { games, error: None })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_api_games_and_defaults_optional_fields() {
        let value = serde_json::json!({
            "response": {
                "games": [
                    {"appid": 730, "name": "CS2", "playtime_forever": 600},
                    {"appid": 440}
                ]
            }
        });
        assert_eq!(
            parse_owned_games_response(value),
            vec![
                OwnedGame {
                    appid: 730,
                    name: "CS2".into(),
                    playtime_forever: 600,
                    is_family: None,
                },
                OwnedGame {
                    appid: 440,
                    name: String::new(),
                    playtime_forever: 0,
                    is_family: None,
                },
            ],
        );
    }

    #[test]
    fn merge_keeps_api_time_then_uses_recent_then_local() {
        let games = vec![
            OwnedGame {
                appid: 10,
                name: "API".into(),
                playtime_forever: 120,
                is_family: None,
            },
            OwnedGame {
                appid: 20,
                name: "Recent".into(),
                playtime_forever: 0,
                is_family: Some(true),
            },
            OwnedGame {
                appid: 30,
                name: "Local".into(),
                playtime_forever: 0,
                is_family: Some(true),
            },
        ];
        let recent = HashMap::from([(20, 80)]);
        let local = HashMap::from([(10, 999), (20, 999), (30, 40)]);
        let result = merge_local_playtimes(merge_recent_playtimes(games, &recent), &local);
        assert_eq!(result[0].playtime_forever, 120);
        assert_eq!(result[1].playtime_forever, 80);
        assert_eq!(result[2].playtime_forever, 40);
    }

    #[test]
    fn merge_filters_dlc_and_marks_library_only_games_as_family() {
        let api_games = vec![
            OwnedGame {
                appid: 10,
                name: "Owned".into(),
                playtime_forever: 120,
                is_family: None,
            },
            OwnedGame {
                appid: 40,
                name: "DLC".into(),
                playtime_forever: 5,
                is_family: None,
            },
        ];
        let app_info = HashMap::from([
            (
                "20".into(),
                AppInfoEntry {
                    name: "Family".into(),
                    app_type: "Game".into(),
                },
            ),
            (
                "40".into(),
                AppInfoEntry {
                    name: "DLC".into(),
                    app_type: "DLC".into(),
                },
            ),
        ]);
        let result = merge_with_librarycache(api_games, &[10, 20, 40], &app_info);
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].appid, 10);
        assert_eq!(
            result[1],
            OwnedGame {
                appid: 20,
                name: "Family".into(),
                playtime_forever: 0,
                is_family: Some(true),
            }
        );
    }

    #[test]
    fn invalid_cache_item_invalidates_the_cache() {
        assert!(parse_owned_games_cache(
            br#"[{"appid":"730","name":"CS2","playtimeForever":600}]"#,
        )
        .is_none());
    }
}
