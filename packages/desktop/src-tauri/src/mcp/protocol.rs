use serde_json::{json, Value};

/// Send a JSON-RPC request to an MCP server
pub(crate) async fn jsonrpc_request(
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
pub(crate) async fn jsonrpc_notify(
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
