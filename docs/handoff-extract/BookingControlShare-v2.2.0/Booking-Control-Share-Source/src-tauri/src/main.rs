#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use serde::Serialize;
use std::{
    fs,
    net::TcpListener,
    process::{Child, Command, Stdio},
    sync::Mutex,
};
use tauri::{path::BaseDirectory, Manager, RunEvent};
use uuid::Uuid;

struct BackendProcess(Mutex<Option<Child>>);

#[derive(Clone, Serialize)]
struct RuntimeConfig {
    api_url: String,
    api_key: String,
    diagnostics_log_path: String,
}
struct RuntimeState(RuntimeConfig);

fn spawn_backend<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
    port: u16,
    key: &str,
) -> Result<Child, String> {
    let data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

    #[cfg(debug_assertions)]
    let mut command = {
        let backend = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../backend");
        let mut command = Command::new("uv");
        command
            .args(["run", "python", "packaging/entrypoint.py"])
            .current_dir(backend);
        command
    };
    #[cfg(not(debug_assertions))]
    let mut command = {
        let resource = if cfg!(windows) {
            "backend/ttdapi.exe"
        } else {
            "backend/ttdapi"
        };
        let executable = app
            .path()
            .resolve(resource, BaseDirectory::Resource)
            .map_err(|e| e.to_string())?;
        let mut command = Command::new(executable);
        command.current_dir(&data_dir);
        command
    };
    command
        .env("HOST", "127.0.0.1")
        .env("PORT", port.to_string())
        .env("API_KEY", key)
        .env("ENVIRONMENT", "prod")
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null());
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }
    command
        .spawn()
        .map_err(|e| format!("Could not start local backend: {e}"))
}

#[tauri::command]
fn get_runtime_config(state: tauri::State<'_, RuntimeState>) -> RuntimeConfig {
    state.0.clone()
}

fn stop_backend(child: &mut Child) {
    #[cfg(target_os = "windows")]
    if matches!(child.try_wait(), Ok(None)) {
        use std::os::windows::process::CommandExt;
        let system = std::path::PathBuf::from(
            std::env::var_os("SystemRoot").unwrap_or_else(|| "C:\\Windows".into()),
        );
        // The one-file Python launcher has a child server. Stop only the tree
        // rooted at the process this app spawned, never processes by image name.
        let _ = Command::new(system.join("System32/taskkill.exe"))
            .args(["/PID", &child.id().to_string(), "/T", "/F"])
            .creation_flags(0x08000000)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status();
    }
    let _ = child.kill();
    let _ = child.wait();
}

fn main() {
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("could not allocate local port");
    let port = listener
        .local_addr()
        .expect("could not read local port")
        .port();
    drop(listener);
    let api_key = Uuid::new_v4().simple().to_string();
    tauri::Builder::default()
        .manage(BackendProcess(Mutex::new(None)))
        .setup(move |app| {
            let log_path = app.path().app_data_dir()?.join("logs/startup.log");
            let child =
                spawn_backend(app.handle(), port, &api_key).map_err(std::io::Error::other)?;
            *app.state::<BackendProcess>()
                .0
                .lock()
                .expect("backend lock poisoned") = Some(child);
            app.manage(RuntimeState(RuntimeConfig {
                api_url: format!("http://127.0.0.1:{port}"),
                api_key: api_key.clone(),
                diagnostics_log_path: log_path.display().to_string(),
            }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_runtime_config])
        .build(tauri::generate_context!())
        .expect("could not build local application")
        .run(|app, event| {
            if let RunEvent::ExitRequested { .. } | RunEvent::Exit = event {
                if let Some(state) = app.try_state::<BackendProcess>() {
                    if let Some(mut child) = state.0.lock().expect("backend lock poisoned").take() {
                        stop_backend(&mut child);
                    }
                }
            }
        });
}
