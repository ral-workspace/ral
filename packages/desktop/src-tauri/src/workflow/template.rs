use std::collections::HashMap;

use regex::Regex;
use serde_json::Value;

/// Template context that accumulates step results during workflow execution.
pub struct TemplateContext {
    step_results: HashMap<String, Value>,
    /// Ordered list of step IDs to track the last step
    step_order: Vec<String>,
    last_run_at: Option<String>,
}

impl TemplateContext {
    pub fn new(last_run_at: Option<String>) -> Self {
        Self {
            step_results: HashMap::new(),
            step_order: Vec::new(),
            last_run_at,
        }
    }

    pub fn set_step_result(&mut self, step_id: &str, value: Value) {
        self.step_results.insert(step_id.to_string(), value);
        self.step_order.push(step_id.to_string());
    }

    /// Get the result of the last completed step
    pub fn last_step_result(&self) -> Option<&Value> {
        self.step_order.last().and_then(|id| self.step_results.get(id))
    }

    /// Render a template string, replacing `{{expr}}` placeholders.
    ///
    /// Supported expressions:
    /// - `{{date}}` → today's date (YYYY-MM-DD)
    /// - `{{last_run_at}}` → previous run timestamp
    /// - `{{step_id.result}}` → result from a previous step
    pub fn render(&self, template: &str) -> String {
        let re = Regex::new(r"\{\{(.+?)\}\}").unwrap();

        re.replace_all(template, |caps: &regex::Captures| {
            let expr = caps[1].trim();
            match expr {
                "date" => chrono::Local::now().format("%Y-%m-%d").to_string(),
                "last_run_at" => self
                    .last_run_at
                    .clone()
                    .unwrap_or_else(|| "never".to_string()),
                _ => {
                    // Try step_id.result pattern
                    if let Some(step_id) = expr.strip_suffix(".result") {
                        if let Some(val) = self.step_results.get(step_id) {
                            value_to_string(val)
                        } else {
                            format!("{{{{{}}}}}", expr)
                        }
                    } else if let Some(val) = self.step_results.get(expr) {
                        value_to_string(val)
                    } else {
                        format!("{{{{{}}}}}", expr)
                    }
                }
            }
        })
        .to_string()
    }

    /// Render all string values within a JSON Value.
    pub fn render_value(&self, value: &Value) -> Value {
        match value {
            Value::String(s) => Value::String(self.render(s)),
            Value::Object(map) => {
                let mut new_map = serde_json::Map::new();
                for (k, v) in map {
                    new_map.insert(k.clone(), self.render_value(v));
                }
                Value::Object(new_map)
            }
            Value::Array(arr) => Value::Array(arr.iter().map(|v| self.render_value(v)).collect()),
            other => other.clone(),
        }
    }
}

/// Convert a JSON value to a string for template insertion.
pub fn value_to_string(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Null => "null".to_string(),
        other => other.to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_render_date() {
        let ctx = TemplateContext::new(None);
        let result = ctx.render("today is {{date}}");
        let today = chrono::Local::now().format("%Y-%m-%d").to_string();
        assert_eq!(result, format!("today is {}", today));
    }

    #[test]
    fn test_render_step_result() {
        let mut ctx = TemplateContext::new(None);
        ctx.set_step_result("fetch", json!("hello world"));
        assert_eq!(ctx.render("got: {{fetch.result}}"), "got: hello world");
    }

    #[test]
    fn test_render_last_run_at() {
        let ctx = TemplateContext::new(Some("2025-01-01T00:00:00Z".to_string()));
        assert_eq!(
            ctx.render("since {{last_run_at}}"),
            "since 2025-01-01T00:00:00Z"
        );
    }

    #[test]
    fn test_render_value() {
        let mut ctx = TemplateContext::new(None);
        ctx.set_step_result("step1", json!("data"));
        let input = json!({
            "query": "search {{step1.result}}",
            "count": 10
        });
        let output = ctx.render_value(&input);
        assert_eq!(output["query"], "search data");
        assert_eq!(output["count"], 10);
    }
}
