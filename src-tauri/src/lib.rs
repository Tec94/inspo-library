use rusqlite::{params, Connection, OptionalExtension};
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::{Path, PathBuf}, sync::Mutex};
use tauri::Manager;
use tokio::sync::Notify;
mod remote;

struct AppState { root: PathBuf, db: Mutex<Connection>, cancel: Notify, sources: remote::Requests }

fn hash(bytes: &[u8]) -> String { format!("{:x}", Sha256::digest(bytes)) }
fn asset_path(root: &Path, key: &str) -> Result<PathBuf, String> {
    if key.len() != 64 || !key.bytes().all(|b| b.is_ascii_hexdigit() && !b.is_ascii_uppercase()) { return Err("Invalid asset identifier.".into()); }
    Ok(root.join("objects").join(key))
}

#[tauri::command]
fn load_library(state: tauri::State<AppState>) -> Result<Option<String>, String> {
    let db = state.db.lock().map_err(|_| "The library is busy. Try reopening the app.")?;
    db.query_row("SELECT body FROM library WHERE id=1", [], |row| row.get(0)).optional().map_err(|_| "Unable to read the library.".into())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Library { version: u32, profile: Profile, collections: Vec<String>, items: Vec<Item>, lessons: Vec<Lesson>, terms: Vec<Term>, provider: Provider, #[serde(default)] import_settings: ImportSettings }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Profile { name: String, context: String, interests: Vec<String>, tools: String, completed: bool, step: u32, theme: String, reduce_motion: bool }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Item { id: String, title: String, kind: String, asset: String, mime: String, width: f64, height: f64, body: String, url: String, tags: Vec<String>, collections: Vec<String>, favorite: bool, state: String, created_at: String, x: f64, y: f64, origin: String, #[serde(default)] media: Vec<SavedMedia>, embed: Option<Embed>, capture: Option<Capture>, review: Option<Review> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct SavedMedia { asset: String, mime: String, kind: String, url: String, width: f64, height: f64 }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Embed { provider: String, id: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Capture { status: String, #[serde(default)] error: String, #[serde(default)] fetched_at: String, #[serde(default)] author: String, #[serde(default)] sensitive: bool, #[serde(default)] remote_text: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Review { status: String, reasons: Vec<String> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields, default)]
struct ImportSettings { auto_fetch: bool, download_media: bool, allow_embeds: bool, preferred_keywords: Vec<String>, excluded_keywords: Vec<String>, blocked_domains: Vec<String>, blocked_authors: Vec<String>, review_sensitive: bool, max_download_mb: Option<f64>, request_timeout_seconds: Option<f64> }
impl Default for ImportSettings {
    fn default() -> Self { Self { auto_fetch: true, download_media: true, allow_embeds: true, preferred_keywords: Vec::new(), excluded_keywords: Vec::new(), blocked_domains: Vec::new(), blocked_authors: Vec::new(), review_sensitive: true, max_download_mb: None, request_timeout_seconds: None } }
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Provider { endpoint: String, model: String, vision: bool, local: bool }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Target { item_id: String, label: String, title: String, kind: String, text: String, selection: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Answer { title: String, observations: Vec<Observation>, vocabulary: Vec<AnswerTerm>, explanation: String, recreation: String, uncertainty: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Observation { text: String, sources: Vec<String>, basis: String }
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct AnswerTerm { term: String, definition: String }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Term { term: String, definition: String, lesson_id: Option<String> }
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Lesson { id: String, question: String, answer: Answer, targets: Vec<Target>, created_at: String }

fn validate_library(json: &str, root: &Path) -> Result<(), String> {
    let library: Library = serde_json::from_str(json).map_err(|_| "The library data is not compatible.")?;
    if library.version != 1 { return Err("This library version is not supported.".into()); }
    if [library.import_settings.max_download_mb, library.import_settings.request_timeout_seconds].iter().flatten().any(|value| !value.is_finite() || *value <= 0.0) { return Err("Import size and timeout settings must be positive or unset.".into()); }
    let demos = ["A5Pce5.png", "VNEeQ.png", "YJyTv.png", "PJGlf.png", "V9fCQL.png", "S2DPo.png", "GWQho.png", "oQWkt.png", "editorial.svg", "colors.svg", "type.svg", "balance.svg", "contrast.svg", "space.svg"];
    let mut ids = std::collections::HashSet::new();
    for item in &library.items {
        if item.title.trim().is_empty() || !ids.insert(&item.id) || !["image", "video", "pdf", "note", "link", "file"].contains(&item.kind.as_str()) || !["active", "archived", "trashed"].contains(&item.state.as_str()) || item.width <= 0.0 || item.height <= 0.0 { return Err("A reference has invalid data.".into()); }
        if !item.url.is_empty() { web_url(&item.url)?; }
        for asset in std::iter::once(&item.asset).chain(item.media.iter().map(|media| &media.asset)) {
            if asset.is_empty() { continue; }
            if let Some(name) = asset.strip_prefix("demo/") { if !demos.contains(&name) { return Err("Unknown sample asset.".into()); } }
            else if !asset_path(root, asset)?.is_file() { return Err("A source file is missing. The library was not changed.".into()); }
        }
        for media in &item.media {
            if !["image", "video"].contains(&media.kind.as_str()) || media.width <= 0.0 || media.height <= 0.0 { return Err("A downloaded media reference has invalid data.".into()); }
            if !media.url.is_empty() { web_url(&media.url)?; }
        }
        if let Some(embed) = &item.embed {
            if !["youtube", "vimeo", "x"].contains(&embed.provider.as_str()) || embed.id.is_empty() || !embed.id.bytes().all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-') { return Err("The reference embed is invalid.".into()); }
        }
        if item.capture.as_ref().is_some_and(|capture| !["queued", "fetching", "ready", "partial", "failed", "disabled"].contains(&capture.status.as_str())) { return Err("The reference capture state is invalid.".into()); }
        if item.review.as_ref().is_some_and(|review| !["pending", "approved"].contains(&review.status.as_str())) { return Err("The reference review state is invalid.".into()); }
    }
    Ok(())
}

#[tauri::command]
fn save_library(state: tauri::State<AppState>, json: String) -> Result<(), String> {
    validate_library(&json, &state.root)?;
    let mut db = state.db.lock().map_err(|_| "The library is busy.")?;
    let tx = db.transaction().map_err(|_| "Unable to start the local save.")?;
    tx.execute("INSERT INTO library(id,body) VALUES(1,?1) ON CONFLICT(id) DO UPDATE SET body=excluded.body", params![json]).map_err(|_| "Unable to save. Check available disk space.")?;
    tx.commit().map_err(|_| "The local save did not complete. Try again.".into())
}

#[tauri::command]
fn save_asset(state: tauri::State<AppState>, key: String, bytes: Vec<u8>) -> Result<(), String> {
    let destination = asset_path(&state.root, &key)?;
    if hash(&bytes) != key { return Err("The imported file failed its integrity check.".into()); }
    if destination.is_file() { return Ok(()); }
    let staging = state.root.join("objects").join(format!("{}.tmp", uuid::Uuid::new_v4()));
    let result = (|| -> std::io::Result<()> { let mut file = fs::OpenOptions::new().write(true).create_new(true).open(&staging)?; file.write_all(&bytes)?; file.sync_all()?; drop(file); if destination.exists() { fs::remove_file(&staging)?; } else { fs::rename(&staging, &destination)?; } Ok(()) })();
    if result.is_err() { let _ = fs::remove_file(staging); return Err("Unable to store the file. Check available disk space.".into()); }
    Ok(())
}

#[tauri::command]
fn read_asset(state: tauri::State<AppState>, key: String) -> Result<Vec<u8>, String> { fs::read(asset_path(&state.root, &key)?).map_err(|_| "The local file is unavailable. Re-import the original file.".into()) }

fn web_url(input: &str) -> Result<url::Url, String> {
    let url = url::Url::parse(input).map_err(|_| "Enter a valid URL.")?;
    if !["http", "https"].contains(&url.scheme()) || !url.username().is_empty() || url.password().is_some() { return Err("Use an HTTP or HTTPS URL without embedded credentials.".into()); }
    Ok(url)
}
fn provider_url(endpoint: &str, local: bool) -> Result<url::Url, String> {
    let mut url = web_url(endpoint)?;
    let loopback = ["localhost", "127.0.0.1", "[::1]"].contains(&url.host_str().unwrap_or(""));
    if (url.scheme() != "https" && !loopback) || (local && !loopback) || url.query().is_some() || url.fragment().is_some() { return Err("Use HTTPS for a remote model, or localhost for a local model.".into()); }
    url.set_path(&format!("{}/chat/completions", url.path().trim_end_matches('/'))); Ok(url)
}
fn credential(endpoint: &str) -> Result<keyring::Entry, String> { keyring::Entry::new("Inspo Library", &hash(endpoint.as_bytes())).map_err(|_| "The operating system credential store is unavailable.".into()) }

#[tauri::command]
fn set_provider_key(endpoint: String, secret: String) -> Result<(), String> {
    provider_url(&endpoint, false)?;
    let entry = credential(&endpoint)?;
    if secret.is_empty() { match entry.delete_credential() { Ok(()) | Err(keyring::Error::NoEntry) => Ok(()), Err(_) => Err("Unable to remove the saved key.".into()) } }
    else { entry.set_password(&secret).map_err(|_| "Unable to save the key in the operating system credential store.".into()) }
}

#[tauri::command]
async fn analyze(state: tauri::State<'_, AppState>, endpoint: String, local: bool, payload: String) -> Result<String, String> {
    let url = provider_url(&endpoint, local)?;
    let body: serde_json::Value = serde_json::from_str(&payload).map_err(|_| "The analysis request is invalid.")?;
    let client = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).build().map_err(|_| "Unable to connect to the provider.")?;
    let mut request = client.post(url).json(&body);
    match credential(&endpoint)?.get_password() { Ok(key) => request = request.bearer_auth(key), Err(keyring::Error::NoEntry) => (), Err(_) => return Err("Unable to read the saved provider key.".into()) }
    let work = async { let response = request.send().await.map_err(|_| "Unable to reach the model. Check the endpoint and network connection.")?; match response.status().as_u16() { 200..=299 => response.text().await.map_err(|_| "The model response was interrupted.".into()), 401 | 403 => Err("The provider rejected the API key. Update the connection and try again.".into()), 429 => Err("The provider is rate-limiting requests. Wait, then try again.".into()), _ => Err("The model request failed. Check the endpoint and model name.".into()) } };
    tokio::select! { result = work => result, _ = state.cancel.notified() => Err("Analysis cancelled. Your sources are unchanged.".into()) }
}

#[tauri::command]
fn cancel_analysis(state: tauri::State<AppState>) { state.cancel.notify_waiters(); }
#[tauri::command]
async fn fetch_source_document(state: tauri::State<'_, AppState>, url: String, request_timeout_seconds: Option<f64>, request_id: String) -> Result<remote::Document, String> {
    state.sources.run(request_id, request_timeout_seconds, remote::document(&url)).await
}
#[tauri::command]
async fn download_source_asset(state: tauri::State<'_, AppState>, url: String, max_download_mb: Option<f64>, request_timeout_seconds: Option<f64>, request_id: String) -> Result<remote::Asset, String> {
    state.sources.run(request_id, request_timeout_seconds, remote::asset(&url, &state.root, max_download_mb)).await
}
#[tauri::command]
fn cancel_source_request(state: tauri::State<AppState>, request_id: String) { state.sources.cancel(&request_id); }
#[tauri::command]
fn open_external(url: String) -> Result<(), String> { let parsed = web_url(&url)?; open::that(parsed.as_str()).map_err(|_| "Unable to open the default browser.".into()) }

pub fn run() {
    tauri::Builder::default().setup(|app| {
        let root = app.path().app_local_data_dir()?; fs::create_dir_all(root.join("objects"))?;
        let db = Connection::open(root.join("library.sqlite"))?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS library(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL CHECK(json_valid(body))); PRAGMA user_version=1;")?;
        app.manage(AppState { root, db: Mutex::new(db), cancel: Notify::new(), sources: remote::Requests::default() }); Ok(())
    }).invoke_handler(tauri::generate_handler![load_library, save_library, save_asset, read_asset, set_provider_key, analyze, cancel_analysis, open_external, fetch_source_document, download_source_asset, cancel_source_request]).run(tauri::generate_context!()).expect("Unable to start Inspo Library");
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn trust_boundaries_reject_paths_and_unsafe_endpoints() {
        let root = Path::new("library");
        assert!(asset_path(root, "../secret").is_err());
        assert!(asset_path(root, &hash(b"hello")).is_ok());
        assert!(provider_url("http://example.com/v1", false).is_err());
        assert!(provider_url("https://user:password@example.com/v1", false).is_err());
        assert!(provider_url("https://example.com/v1?token=secret", false).is_err());
        assert!(provider_url("http://localhost:11434/v1", true).is_ok());
        assert!(provider_url("https://example.com/v1", true).is_err());
        assert!(web_url("javascript:alert(1)").is_err());
    }
    #[test]
    fn old_libraries_load_and_new_media_is_validated_before_saving() {
        let root = std::env::temp_dir().join(format!("inspo-schema-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(root.join("objects")).unwrap();
        let mut library = serde_json::json!({
            "version": 1,
            "profile": {"name":"My library","context":"","interests":[],"tools":"","completed":true,"step":0,"theme":"light","reduceMotion":false},
            "collections": [], "lessons": [], "terms": [],
            "provider": {"endpoint":"http://localhost:11434/v1","model":"","vision":false,"local":true},
            "items": [{"id":"source","title":"Saved source","kind":"link","asset":"","mime":"","width":600,"height":600,"body":"","url":"https://example.com/","tags":[],"collections":[],"favorite":false,"state":"active","createdAt":"2026-09-12T00:00:00Z","x":0,"y":0,"origin":"Imported by you"}]
        });
        assert!(validate_library(&library.to_string(), &root).is_ok());
        let key = hash(b"local media");
        fs::write(root.join("objects").join(&key), b"local media").unwrap();
        library["importSettings"] = serde_json::json!({"autoFetch":true,"downloadMedia":true,"allowEmbeds":true,"preferredKeywords":[],"excludedKeywords":[],"blockedDomains":[],"blockedAuthors":[],"reviewSensitive":true,"maxDownloadMb":null,"requestTimeoutSeconds":null});
        library["items"][0]["media"] = serde_json::json!([{"asset":key,"mime":"image/png","kind":"image","url":"https://example.com/image.png","width":600,"height":600}]);
        library["items"][0]["embed"] = serde_json::json!({"provider":"youtube","id":"Abc_123-x"});
        library["items"][0]["capture"] = serde_json::json!({"status":"ready"});
        library["items"][0]["review"] = serde_json::json!({"status":"pending","reasons":["Needs review"]});
        assert!(validate_library(&library.to_string(), &root).is_ok());
        library["items"][0]["media"][0]["asset"] = serde_json::json!("../private");
        assert!(validate_library(&library.to_string(), &root).is_err());
        library["items"][0]["media"][0]["asset"] = serde_json::json!(hash(b"missing"));
        assert!(validate_library(&library.to_string(), &root).is_err());
        fs::remove_dir_all(root).unwrap();
    }
}
