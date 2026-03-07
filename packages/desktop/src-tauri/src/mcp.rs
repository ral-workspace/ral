use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Instant;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::State;

/// Per-server MCP session state
struct SessionInfo {
    session_id: Option<String>,
    next_id: u64,
}

/// Managed state for all MCP server connections
pub(crate) struct McpState {
    sessions: HashMap<String, SessionInfo>,
    http: reqwest::Client,
}

impl McpState {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            http: reqwest::Client::new(),
        }
    }
}

#[derive(Serialize, Clone)]
pub(crate) struct McpToolInfo {
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "resourceUri")]
    pub resource_uri: Option<String>,
}

/// Send a JSON-RPC request to an MCP server
async fn jsonrpc_request(
    http: &reqwest::Client,
    url: &str,
    session_id: Option<&str>,
    method: &str,
    params: Value,
    id: u64,
) -> Result<(Value, Option<String>), String> {
    let body = json!({
        "jsonrpc": "2.0",
        "method": method,
        "params": params,
        "id": id,
    });

    let mut req = http
        .post(url)
        .header("Content-Type", "application/json")
        .header("Accept", "application/json, text/event-stream")
        .json(&body);

    if let Some(sid) = session_id {
        req = req.header("Mcp-Session-Id", sid);
    }

    let resp = req
        .send()
        .await
        .map_err(|e| format!("MCP request '{}' failed: {}", method, e))?;

    // Capture session ID from response header
    let new_session_id = resp
        .headers()
        .get("Mcp-Session-Id")
        .and_then(|v| v.to_str().ok())
        .map(String::from);

    let content_type = resp
        .headers()
        .get("content-type")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();

    let body = resp
        .text()
        .await
        .map_err(|e| format!("MCP response read failed for '{}': {}", method, e))?;

    eprintln!("[mcp] {} response content-type: {}, body length: {}", method, content_type, body.len());

    // Parse JSON from response body — handle both JSON and SSE formats
    let json: Value = if content_type.contains("text/event-stream") {
        // SSE format: extract JSON from "data: {...}" lines
        let mut result_json: Option<Value> = None;
        for line in body.lines() {
            if let Some(data) = line.strip_prefix("data: ") {
                if let Ok(parsed) = serde_json::from_str::<Value>(data) {
                    result_json = Some(parsed);
                    break;
                }
            }
        }
        result_json.ok_or_else(|| format!("No JSON data found in SSE response for '{}'", method))?
    } else {
        serde_json::from_str(&body)
            .map_err(|e| format!("MCP response parse failed for '{}': {} (body: {})", method, e, &body[..body.len().min(200)]))?
    };

    if let Some(error) = json.get("error") {
        return Err(format!("MCP error from '{}': {}", method, error));
    }

    let result = json.get("result").cloned().unwrap_or(Value::Null);
    Ok((result, new_session_id))
}

/// Send a JSON-RPC notification (no id, no response expected)
async fn jsonrpc_notify(
    http: &reqwest::Client,
    url: &str,
    session_id: Option<&str>,
    method: &str,
) -> Result<(), String> {
    let body = json!({
        "jsonrpc": "2.0",
        "method": method,
    });

    let mut req = http
        .post(url)
        .header("Content-Type", "application/json")
        .json(&body);

    if let Some(sid) = session_id {
        req = req.header("Mcp-Session-Id", sid);
    }

    req.send()
        .await
        .map_err(|e| format!("MCP notify '{}' failed: {}", method, e))?;

    Ok(())
}

/// Connect to an MCP server: initialize + list tools
#[tauri::command]
pub(crate) async fn mcp_connect(
    state: State<'_, Mutex<McpState>>,
    url: String,
) -> Result<Vec<McpToolInfo>, String> {
    let t0 = Instant::now();
    eprintln!("[mcp] connecting to {}...", url);

    // Get shared HTTP client (clone is cheap — Arc internally)
    let http = {
        let s = state.lock().map_err(|e| e.to_string())?;
        s.http.clone()
    };

    // 1. Initialize
    let t1 = Instant::now();
    let (init_result, session_id) = jsonrpc_request(
        &http,
        &url,
        None,
        "initialize",
        json!({
            "protocolVersion": "2025-11-21",
            "capabilities": {},
            "clientInfo": { "name": "Helm", "version": "1.0.0" }
        }),
        1,
    )
    .await?;
    eprintln!(
        "[mcp] initialized ({}ms), session_id: {:?}",
        t1.elapsed().as_millis(),
        session_id
    );
    eprintln!("[mcp] server info: {}", init_result.get("serverInfo").unwrap_or(&Value::Null));

    // 2. Send initialized notification
    jsonrpc_notify(&http, &url, session_id.as_deref(), "notifications/initialized").await?;

    // 3. List tools
    let t2 = Instant::now();
    let (tools_result, _) = jsonrpc_request(
        &http,
        &url,
        session_id.as_deref(),
        "tools/list",
        json!({}),
        2,
    )
    .await?;

    let tools = tools_result
        .get("tools")
        .and_then(|t| t.as_array())
        .cloned()
        .unwrap_or_default();

    let tool_infos: Vec<McpToolInfo> = tools
        .iter()
        .map(|t| {
            let name = t
                .get("name")
                .and_then(|n| n.as_str())
                .unwrap_or("")
                .to_string();
            let description = t
                .get("description")
                .and_then(|d| d.as_str())
                .map(String::from);
            let resource_uri = t
                .get("_meta")
                .and_then(|m| m.get("ui"))
                .and_then(|u| u.get("resourceUri"))
                .and_then(|r| r.as_str())
                .map(String::from);
            McpToolInfo {
                name,
                description,
                resource_uri,
            }
        })
        .collect();

    eprintln!(
        "[mcp] listTools: {} tools ({}ms)",
        tool_infos.len(),
        t2.elapsed().as_millis()
    );

    // Store session
    {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        s.sessions.insert(
            url.clone(),
            SessionInfo {
                session_id,
                next_id: 3, // Already used 1 (initialize) and 2 (tools/list)
            },
        );
    }

    eprintln!("[mcp] ready (total {}ms)", t0.elapsed().as_millis());
    Ok(tool_infos)
}

/// Read a resource from an MCP server (must call mcp_connect first)
#[tauri::command]
pub(crate) async fn mcp_read_resource(
    state: State<'_, Mutex<McpState>>,
    url: String,
    uri: String,
) -> Result<String, String> {
    let t0 = Instant::now();
    eprintln!("[mcp] reading resource: {} from {}", uri, url);

    // Extract what we need from state (release lock before async work)
    let (http, session_id, id) = {
        let mut s = state.lock().map_err(|e| e.to_string())?;
        let info = s
            .sessions
            .get_mut(&url)
            .ok_or("MCP session not found. Call mcp_connect first.")?;
        let id = info.next_id;
        info.next_id += 1;
        let sid = info.session_id.clone();
        let client = s.http.clone();
        (client, sid, id)
    };

    let (result, _) = jsonrpc_request(
        &http,
        &url,
        session_id.as_deref(),
        "resources/read",
        json!({ "uri": uri }),
        id,
    )
    .await?;

    let text = result
        .get("contents")
        .and_then(|c| c.as_array())
        .and_then(|arr| arr.first())
        .and_then(|c| c.get("text"))
        .and_then(|t| t.as_str())
        .ok_or("No text content in MCP resource response")?
        .to_string();

    let ends_with_html = text.trim_end().ends_with("</html>");
    let last50: String = text.chars().rev().take(50).collect::<String>().chars().rev().collect();
    eprintln!(
        "[mcp] resource read: {} bytes ({}ms), ends with </html>: {}, last 50: {:?}",
        text.len(),
        t0.elapsed().as_millis(),
        ends_with_html,
        last50
    );

    Ok(text)
}
