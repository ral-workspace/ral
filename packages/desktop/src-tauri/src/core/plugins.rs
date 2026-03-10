use serde::Deserialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::OnceLock;
use tauri_plugin_store::StoreExt;

const BUILTIN_MARKETPLACE: &str = "ral-plugins";
const BUILTIN_REPO: &str = "cohaku-ai/ral-plugins";
const MARKETPLACE_URL: &str =
    "https://raw.githubusercontent.com/cohaku-ai/ral-plugins/main/.claude-plugin/marketplace.json";
const VERSIONS_STORE_KEY: &str = "builtin-plugin-versions";

#[derive(Debug, Deserialize)]
struct MarketplaceJson {
    plugins: Vec<MarketplacePlugin>,
}

#[derive(Debug, Deserialize)]
struct MarketplacePlugin {
    name: String,
    version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ClaudeSettings {
    #[serde(rename = "enabledPlugins", default)]
    enabled_plugins: HashMap<String, serde_json::Value>,
}

/// Cached shell PATH for running CLI commands from GUI app
static SHELL_PATH: OnceLock<Option<String>> = OnceLock::new();

fn resolve_shell_path() -> Option<String> {
    SHELL_PATH
        .get_or_init(|| {
            let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
            let output = std::process::Command::new(&shell)
                .args(["-l", "-c", "echo $PATH"])
                .output()
                .ok()?;
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if path.is_empty() {
                None
            } else {
                Some(path)
            }
        })
        .clone()
}

fn claude_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".claude/local/claude")
}

async fn run_claude(args: &[&str]) -> Result<String, String> {
    let mut cmd = tokio::process::Command::new(claude_path());
    cmd.args(args);
    if let Some(ref path) = resolve_shell_path() {
        cmd.env("PATH", path);
    }
    let output = cmd
        .output()
        .await
        .map_err(|e| format!("Failed to run claude: {}", e))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("claude command failed: {}", stderr))
    }
}

fn settings_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_default()
        .join(".claude/settings.json")
}

fn read_claude_settings() -> Result<ClaudeSettings, String> {
    let content =
        std::fs::read_to_string(settings_path()).map_err(|e| format!("read settings: {}", e))?;
    serde_json::from_str(&content).map_err(|e| format!("parse settings: {}", e))
}

/// Run on app startup (in a background task). Ensures all built-in plugins
/// from the ral-plugins marketplace are installed and up to date.
pub async fn ensure_builtin_plugins(app: tauri::AppHandle) {
    if let Err(e) = ensure_builtin_plugins_inner(&app).await {
        eprintln!("[plugins] ensure_builtin_plugins failed: {}", e);
    }
}

async fn ensure_builtin_plugins_inner(app: &tauri::AppHandle) -> Result<(), String> {
    // 1. Fetch marketplace.json to get current builtin plugin list
    let marketplace: MarketplaceJson = reqwest::get(MARKETPLACE_URL)
        .await
        .map_err(|e| format!("fetch marketplace: {}", e))?
        .json()
        .await
        .map_err(|e| format!("parse marketplace: {}", e))?;

    if marketplace.plugins.is_empty() {
        return Ok(());
    }

    // 2. Load version cache from Tauri Store
    let store = app
        .store("settings.json")
        .map_err(|e| format!("open store: {}", e))?;
    let cached_versions: HashMap<String, String> = store
        .get(VERSIONS_STORE_KEY)
        .and_then(|v| serde_json::from_value(v).ok())
        .unwrap_or_default();

    // 3. Read Claude settings.json to check what's actually installed
    let settings = read_claude_settings().unwrap_or(ClaudeSettings {
        enabled_plugins: HashMap::new(),
    });

    // 4. Determine what needs action
    let needs_action: Vec<&MarketplacePlugin> = marketplace
        .plugins
        .iter()
        .filter(|p| {
            let is_installed = settings
                .enabled_plugins
                .keys()
                .any(|k| k.split('@').next() == Some(&p.name));
            if !is_installed {
                return true;
            }
            let latest_version = p.version.as_deref().unwrap_or("");
            let cached_version = cached_versions.get(&p.name).map(|s: &String| s.as_str()).unwrap_or("");
            cached_version != latest_version
        })
        .collect();

    if needs_action.is_empty() {
        eprintln!("[plugins] all builtins up to date");
        return Ok(());
    }

    eprintln!(
        "[plugins] need action: {:?}",
        needs_action.iter().map(|p| &p.name).collect::<Vec<_>>()
    );

    // 5. Ensure marketplace is registered (add is a no-op if already known)
    let _ = run_claude(&["plugin", "marketplace", "add", BUILTIN_REPO]).await;

    // 6. Install/update each plugin
    for plugin in &needs_action {
        let install_arg = format!("{}@{}", plugin.name, BUILTIN_MARKETPLACE);
        match run_claude(&["plugin", "install", &install_arg]).await {
            Ok(out) => {
                eprintln!("[plugins] installed {}: {}", plugin.name, out.trim());
            }
            Err(e) => {
                eprintln!("[plugins] install failed {}: {}", plugin.name, e);
            }
        }
    }

    // 7. Re-read settings.json to verify what actually got installed,
    //    then rebuild the version cache from ground truth
    let verified_settings = read_claude_settings().unwrap_or(ClaudeSettings {
        enabled_plugins: HashMap::new(),
    });
    let mut verified_versions: HashMap<String, String> = HashMap::new();
    for plugin in &marketplace.plugins {
        let actually_installed = verified_settings
            .enabled_plugins
            .keys()
            .any(|k| k.split('@').next() == Some(&plugin.name));
        if actually_installed {
            verified_versions.insert(
                plugin.name.clone(),
                plugin.version.clone().unwrap_or_default(),
            );
        }
    }
    store.set(
        VERSIONS_STORE_KEY,
        serde_json::to_value(&verified_versions).unwrap_or_default(),
    );
    let _ = store.save();

    eprintln!("[plugins] done");
    Ok(())
}
