mod commands;
mod http;
mod protocol;
mod state;
mod steam;
mod storage;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = AppState::new().expect("failed to initialize Tauri application state");
    let protocol_access = state.image_access().clone();

    tauri::Builder::default()
        .manage(state)
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .register_uri_scheme_protocol("steam-image", move |_context, request| {
            protocol::local_image::handle_request(request, &protocol_access)
        })
        .invoke_handler(tauri::generate_handler![
            commands::image_library::scan_images,
            commands::image_library::authorize_local_images,
            commands::collections::load_collections,
            commands::collections::save_collections,
            commands::settings::load_settings,
            commands::settings::save_settings,
            commands::tier_list::load_tier_list,
            commands::tier_list::save_tier_list,
            commands::steam_collections::load_steam_collections,
            commands::image_export::choose_export_directory,
            commands::image_export::export_images,
            commands::owned_games::fetch_owned_games,
            commands::achievements::fetch_api_achievements,
            commands::achievements::cache_achievement_icons,
            commands::achievements::open_achievement_cache_dir,
        ])
        .run(tauri::generate_context!())
        .expect("error while running SteamImageBrowser");
}
