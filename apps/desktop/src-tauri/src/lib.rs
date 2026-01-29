use tauri::{Emitter, Manager, Theme};
use tauri::menu::{Menu, MenuItem, Submenu, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_updater::UpdaterExt;
use std::time::Duration;
use serde::Serialize;

#[tauri::command]
async fn close_splashscreen(window: tauri::Window) {
    if let Some(splashscreen) = window.get_webview_window("splashscreen") {
        let _ = splashscreen.close();
    }
    if let Some(main_window) = window.get_webview_window("main") {
        let _ = main_window.show();
    }
}

#[tauri::command]
async fn get_autostart_enabled(app: tauri::AppHandle) -> Result<bool, String> {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch()
        .is_enabled()
        .map_err(|e| e.to_string())
}

#[tauri::command]
async fn set_autostart_enabled(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    use tauri_plugin_autostart::ManagerExt;
    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())
    } else {
        autostart.disable().map_err(|e| e.to_string())
    }
}

#[tauri::command]
async fn get_system_theme(window: tauri::Window) -> Result<String, String> {
    match window.theme() {
        Ok(Theme::Dark) => Ok("dark".to_string()),
        Ok(Theme::Light) => Ok("light".to_string()),
        _ => Ok("light".to_string()),
    }
}

#[tauri::command]
async fn set_window_theme(window: tauri::Window, theme: String) -> Result<(), String> {
    let tauri_theme = match theme.as_str() {
        "dark" => Some(Theme::Dark),
        "light" => Some(Theme::Light),
        _ => None,
    };
    window.set_theme(tauri_theme).map_err(|e| e.to_string())
}

#[derive(Clone, Serialize)]
struct UpdateCheckResult {
    available: bool,
    version: Option<String>,
    current_version: String,
    body: Option<String>,
}

#[tauri::command]
async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();

    let updater = app.updater_builder().build().map_err(|e| e.to_string())?;

    match updater.check().await {
        Ok(Some(update)) => {
            Ok(UpdateCheckResult {
                available: true,
                version: Some(update.version.clone()),
                current_version,
                body: update.body.clone(),
            })
        }
        Ok(None) => {
            Ok(UpdateCheckResult {
                available: false,
                version: None,
                current_version,
                body: None,
            })
        }
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
async fn get_app_version(app: tauri::AppHandle) -> String {
    app.package_info().version.to_string()
}

fn toggle_window_visibility(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(false) {
            let _ = window.hide();
        } else {
            let _ = window.show();
            let _ = window.set_focus();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            close_splashscreen,
            get_autostart_enabled,
            set_autostart_enabled,
            get_system_theme,
            set_window_theme,
            check_for_update,
            get_app_version
        ])
        .setup(|app| {
            #[cfg(desktop)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;

                let file_menu = Submenu::with_items(
                    app,
                    "Datei",
                    true,
                    &[
                        &MenuItem::with_id(app, "new", "Neuer Text", true, Some("CmdOrCtrl+N"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(app, "settings", "Einstellungen...", true, Some("CmdOrCtrl+,"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::quit(app, Some("Beenden"))?,
                    ],
                )?;

                let edit_menu = Submenu::with_items(
                    app,
                    "Bearbeiten",
                    true,
                    &[
                        &PredefinedMenuItem::undo(app, Some("Rückgängig"))?,
                        &PredefinedMenuItem::redo(app, Some("Wiederholen"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::cut(app, Some("Ausschneiden"))?,
                        &PredefinedMenuItem::copy(app, Some("Kopieren"))?,
                        &PredefinedMenuItem::paste(app, Some("Einfügen"))?,
                        &PredefinedMenuItem::select_all(app, Some("Alles auswählen"))?,
                    ],
                )?;

                let view_menu = Submenu::with_items(
                    app,
                    "Ansicht",
                    true,
                    &[
                        &MenuItem::with_id(app, "reload", "Neu laden", true, Some("CmdOrCtrl+R"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(app, "fullscreen", "Vollbild", true, Some("F11"))?,
                        &MenuItem::with_id(app, "zoom_in", "Vergrößern", true, Some("CmdOrCtrl+Plus"))?,
                        &MenuItem::with_id(app, "zoom_out", "Verkleinern", true, Some("CmdOrCtrl+Minus"))?,
                        &MenuItem::with_id(app, "zoom_reset", "Originalgröße", true, Some("CmdOrCtrl+0"))?,
                    ],
                )?;

                let help_menu = Submenu::with_items(
                    app,
                    "Hilfe",
                    true,
                    &[
                        &MenuItem::with_id(app, "check_updates", "Nach Updates suchen...", true, None::<&str>)?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(app, "docs", "Dokumentation", true, None::<&str>)?,
                        &MenuItem::with_id(app, "feedback", "Feedback senden", true, None::<&str>)?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(app, "about", "Über Grünerator", true, None::<&str>)?,
                    ],
                )?;

                let app_menu = Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &help_menu])?;

                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.set_menu(app_menu)?;
                    main_window.on_menu_event(|window, event| {
                        match event.id.as_ref() {
                            "new" => {
                                let _ = window.emit("menu-new", ());
                            }
                            "settings" => {
                                let _ = window.emit("menu-settings", ());
                            }
                            "reload" => {
                                let _ = window.emit("menu-reload", ());
                            }
                            "fullscreen" => {
                                if let Ok(is_fullscreen) = window.is_fullscreen() {
                                    let _ = window.set_fullscreen(!is_fullscreen);
                                }
                            }
                            "zoom_in" => {
                                let _ = window.emit("menu-zoom", "in");
                            }
                            "zoom_out" => {
                                let _ = window.emit("menu-zoom", "out");
                            }
                            "zoom_reset" => {
                                let _ = window.emit("menu-zoom", "reset");
                            }
                            "docs" => {
                                let _ = window.emit("menu-open-url", "https://gruenerator.de/");
                            }
                            "feedback" => {
                                let _ = window.emit("menu-open-url", "https://gitlab.com/Netzbegruenung/gruenerator/-/issues");
                            }
                            "about" => {
                                let _ = window.emit("menu-about", ());
                            }
                            "check_updates" => {
                                let _ = window.emit("menu-check-updates", ());
                            }
                            _ => {}
                        }
                    });
                }

                let show_hide = MenuItem::with_id(app, "tray_show_hide", "Anzeigen/Verbergen", true, None::<&str>)?;
                let separator = MenuItem::with_id(app, "tray_separator", "─────────────", false, None::<&str>)?;
                let quit = MenuItem::with_id(app, "tray_quit", "Beenden", true, None::<&str>)?;

                let tray_menu = Menu::with_items(app, &[&show_hide, &separator, &quit])?;

                let _tray = TrayIconBuilder::new()
                    .icon(app.default_window_icon().unwrap().clone())
                    .tooltip("Grünerator")
                    .menu(&tray_menu)
                    .show_menu_on_left_click(false)
                    .on_menu_event(|app, event| {
                        match event.id.as_ref() {
                            "tray_show_hide" => toggle_window_visibility(app),
                            "tray_quit" => {
                                app.exit(0);
                            }
                            _ => {}
                        }
                    })
                    .on_tray_icon_event(|tray, event| {
                        if let TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } = event
                        {
                            let app = tray.app_handle();
                            toggle_window_visibility(app);
                        }
                    })
                    .build(app)?;

                let handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        let url_str = url.to_string();
                        if url_str.starts_with("gruenerator://auth/callback") {
                            let _ = handle.emit("deep-link-auth", url_str);
                        }
                    }
                });

                if let Some(main_window) = app.get_webview_window("main") {
                    main_window.open_devtools();
                }

                if let Some(main_window) = app.get_webview_window("main") {
                    let window_clone = main_window.clone();
                    main_window.on_window_event(move |event| {
                        if let tauri::WindowEvent::ThemeChanged(theme) = event {
                            let theme_str = match theme {
                                Theme::Dark => "dark",
                                Theme::Light => "light",
                                _ => "light",
                            };
                            let _ = window_clone.emit("system-theme-changed", theme_str);
                        }
                    });
                }

                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    if let Some(splashscreen) = app_handle.get_webview_window("splashscreen") {
                        let _ = splashscreen.close();
                    }
                    if let Some(main_window) = app_handle.get_webview_window("main") {
                        let _ = main_window.show();
                    }
                });
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
