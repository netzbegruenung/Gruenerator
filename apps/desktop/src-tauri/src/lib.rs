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

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Routes custom menu item ids to the frontend. Native/standard items
/// (undo, copy, fullscreen, minimize, close, quit, …) are predefined menu
/// items that macOS/Tauri handle automatically and never reach this function.
fn handle_menu_event(app: &tauri::AppHandle, id: &str) {
    let window = app.get_webview_window("main");
    let emit = |event: &str, payload: &str| {
        if let Some(w) = &window {
            if payload.is_empty() {
                let _ = w.emit(event, ());
            } else {
                let _ = w.emit(event, payload);
            }
        }
    };
    match id {
        "new" => emit("menu-new", ""),
        "settings" => emit("menu-settings", ""),
        "reload" => emit("menu-reload", ""),
        "zoom_in" => emit("menu-zoom", "in"),
        "zoom_out" => emit("menu-zoom", "out"),
        "zoom_reset" => emit("menu-zoom", "reset"),
        "docs" => emit("menu-open-url", "https://gruenerator.de/"),
        "feedback" => emit("menu-open-url", "https://gitlab.com/Netzbegruenung/gruenerator/-/issues"),
        "about" => emit("menu-about", ""),
        "check_updates" => emit("menu-check-updates", ""),
        _ => {}
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
        .plugin(tauri_plugin_process::init())
        .plugin(
            // Restore only geometry. Crucially NOT decorations (would clobber the
            // native macOS title bar / traffic lights) and NOT visibility (the splash
            // + tray manage when the main window is shown).
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::SIZE
                        | tauri_plugin_window_state::StateFlags::POSITION
                        | tauri_plugin_window_state::StateFlags::MAXIMIZED
                        | tauri_plugin_window_state::StateFlags::FULLSCREEN,
                )
                .build(),
        )
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

                // macOS convention: first submenu is the app menu (About / Settings /
                // Hide / Quit). On Windows/Linux those items live in the File menu.
                #[cfg(target_os = "macos")]
                let app_submenu = Submenu::with_items(
                    app,
                    "Grünerator",
                    true,
                    &[
                        &MenuItem::with_id(app, "about", "Über Grünerator", true, None::<&str>)?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(app, "settings", "Einstellungen...", true, Some("CmdOrCtrl+,"))?,
                        &MenuItem::with_id(app, "check_updates", "Nach Updates suchen...", true, None::<&str>)?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::services(app, Some("Dienste"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::hide(app, Some("Grünerator ausblenden"))?,
                        &PredefinedMenuItem::hide_others(app, Some("Andere ausblenden"))?,
                        &PredefinedMenuItem::show_all(app, Some("Alle einblenden"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::quit(app, Some("Grünerator beenden"))?,
                    ],
                )?;

                #[cfg(target_os = "macos")]
                let file_menu = Submenu::with_items(
                    app,
                    "Datei",
                    true,
                    &[
                        &MenuItem::with_id(app, "new", "Neuer Text", true, Some("CmdOrCtrl+N"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::close_window(app, Some("Fenster schließen"))?,
                    ],
                )?;

                #[cfg(not(target_os = "macos"))]
                let file_menu = Submenu::with_items(
                    app,
                    "Datei",
                    true,
                    &[
                        &MenuItem::with_id(app, "new", "Neuer Text", true, Some("CmdOrCtrl+N"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(app, "settings", "Einstellungen...", true, Some("CmdOrCtrl+,"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::close_window(app, Some("Schließen"))?,
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

                // Native full screen item: ⌃⌘F on macOS, handled automatically.
                let view_menu = Submenu::with_items(
                    app,
                    "Ansicht",
                    true,
                    &[
                        &MenuItem::with_id(app, "reload", "Neu laden", true, Some("CmdOrCtrl+R"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &PredefinedMenuItem::fullscreen(app, Some("Vollbild"))?,
                        &PredefinedMenuItem::separator(app)?,
                        &MenuItem::with_id(app, "zoom_in", "Vergrößern", true, Some("CmdOrCtrl+Plus"))?,
                        &MenuItem::with_id(app, "zoom_out", "Verkleinern", true, Some("CmdOrCtrl+Minus"))?,
                        &MenuItem::with_id(app, "zoom_reset", "Originalgröße", true, Some("CmdOrCtrl+0"))?,
                    ],
                )?;

                // macOS-conventional Window menu (Minimize ⌘M, Zoom).
                #[cfg(target_os = "macos")]
                let window_menu = Submenu::with_items(
                    app,
                    "Fenster",
                    true,
                    &[
                        &PredefinedMenuItem::minimize(app, Some("Minimieren"))?,
                        &PredefinedMenuItem::maximize(app, Some("Zoomen"))?,
                    ],
                )?;

                #[cfg(target_os = "macos")]
                let help_menu = Submenu::with_items(
                    app,
                    "Hilfe",
                    true,
                    &[
                        &MenuItem::with_id(app, "docs", "Dokumentation", true, None::<&str>)?,
                        &MenuItem::with_id(app, "feedback", "Feedback senden", true, None::<&str>)?,
                    ],
                )?;

                #[cfg(not(target_os = "macos"))]
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

                #[cfg(target_os = "macos")]
                let app_menu = Menu::with_items(
                    app,
                    &[&app_submenu, &file_menu, &edit_menu, &view_menu, &window_menu, &help_menu],
                )?;

                #[cfg(not(target_os = "macos"))]
                let app_menu = Menu::with_items(app, &[&file_menu, &edit_menu, &view_menu, &help_menu])?;

                // On macOS the menu is global (app-level); elsewhere it attaches to the window.
                #[cfg(target_os = "macos")]
                {
                    app.set_menu(app_menu)?;
                    app.on_menu_event(|app, event| handle_menu_event(app, event.id.as_ref()));
                }
                #[cfg(not(target_os = "macos"))]
                if let Some(main_window) = app.get_webview_window("main") {
                    let _ = main_window.set_menu(app_menu)?;
                    main_window.on_menu_event(|window, event| {
                        handle_menu_event(window.app_handle(), event.id.as_ref())
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
                    #[cfg(debug_assertions)]
                    main_window.open_devtools();

                    // The window keeps native decorations on macOS so the traffic
                    // lights render via `titleBarStyle: "Overlay"`. On Windows/Linux
                    // we go frameless and draw our own caption controls (DesktopTitlebar).
                    #[cfg(not(target_os = "macos"))]
                    {
                        let _ = main_window.set_decorations(false);
                    }

                    let window_clone = main_window.clone();
                    main_window.on_window_event(move |event| match event {
                        // The app lives in the tray: closing the window (red button /
                        // ⌘W / custom close control) hides it instead of destroying it,
                        // so it can be reopened from the tray or the Dock. Quit (⌘Q)
                        // still terminates the app.
                        tauri::WindowEvent::CloseRequested { api, .. } => {
                            api.prevent_close();
                            let _ = window_clone.hide();
                        }
                        tauri::WindowEvent::ThemeChanged(theme) => {
                            let theme_str = match theme {
                                Theme::Dark => "dark",
                                Theme::Light => "light",
                                _ => "light",
                            };
                            let _ = window_clone.emit("system-theme-changed", theme_str);
                        }
                        _ => {}
                    });
                }

                // Honour the `--minimized` flag passed by the autostart LaunchAgent:
                // start quietly in the tray without surfacing the main window.
                let start_minimized = std::env::args().any(|arg| arg == "--minimized");

                let app_handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_secs(3));
                    if let Some(splashscreen) = app_handle.get_webview_window("splashscreen") {
                        let _ = splashscreen.close();
                    }
                    if !start_minimized {
                        if let Some(main_window) = app_handle.get_webview_window("main") {
                            let _ = main_window.show();
                        }
                    }
                });
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Reopen the window when the Dock icon is clicked (macOS) after it was
            // hidden via close-to-tray.
            if let tauri::RunEvent::Reopen { .. } = event {
                show_main_window(app_handle);
            }
        });
}
