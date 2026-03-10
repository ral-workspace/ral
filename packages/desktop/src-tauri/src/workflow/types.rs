use serde::{Deserialize, Serialize};
use serde_json::Value;

// ── YAML Definition Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowDef {
    pub name: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub trigger: TriggerDef,
    #[serde(default)]
    pub permissions: Vec<String>,
    pub steps: Vec<StepDef>,
    #[serde(default)]
    pub output: Vec<OutputDef>,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TriggerDef {
    #[serde(default)]
    pub schedule: Option<ScheduleTrigger>,
    #[serde(default = "default_true")]
    pub manual: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScheduleTrigger {
    #[serde(rename = "type")]
    pub schedule_type: ScheduleType,
    #[serde(default)]
    pub at: Option<String>,
    #[serde(default)]
    pub day: Option<String>,
    #[serde(default)]
    pub day_of_month: Option<u32>,
    #[serde(default)]
    pub every: Option<u32>,
    #[serde(default)]
    pub unit: Option<String>,
}

impl ScheduleTrigger {
    /// Human-readable schedule description
    pub fn description(&self) -> String {
        match self.schedule_type {
            ScheduleType::Daily => {
                format!("Daily at {}", self.at.as_deref().unwrap_or("00:00"))
            }
            ScheduleType::Weekly => {
                format!(
                    "{} at {}",
                    self.day.as_deref().unwrap_or("Monday"),
                    self.at.as_deref().unwrap_or("00:00")
                )
            }
            ScheduleType::Monthly => {
                format!(
                    "Day {} at {}",
                    self.day_of_month.unwrap_or(1),
                    self.at.as_deref().unwrap_or("00:00")
                )
            }
            ScheduleType::Interval => {
                format!(
                    "Every {} {}",
                    self.every.unwrap_or(1),
                    self.unit.as_deref().unwrap_or("hours")
                )
            }
        }
    }

    /// Convert to cron expression
    pub fn to_cron(&self) -> Result<String, String> {
        match self.schedule_type {
            ScheduleType::Daily => {
                let (hour, minute) = parse_time(self.at.as_deref().unwrap_or("00:00"))?;
                Ok(format!("0 {} {} * * *", minute, hour))
            }
            ScheduleType::Weekly => {
                let (hour, minute) = parse_time(self.at.as_deref().unwrap_or("00:00"))?;
                let dow = day_to_cron(self.day.as_deref().unwrap_or("monday"))?;
                Ok(format!("0 {} {} * * {}", minute, hour, dow))
            }
            ScheduleType::Monthly => {
                let (hour, minute) = parse_time(self.at.as_deref().unwrap_or("00:00"))?;
                let dom = self.day_of_month.unwrap_or(1);
                Ok(format!("0 {} {} {} * *", minute, hour, dom))
            }
            ScheduleType::Interval => {
                let every = self.every.unwrap_or(1);
                let unit = self.unit.as_deref().unwrap_or("hours");
                match unit {
                    "minutes" => Ok(format!("0 */{} * * * *", every)),
                    "hours" => Ok(format!("0 0 */{} * * *", every)),
                    "days" => Ok(format!("0 0 0 */{} * *", every)),
                    _ => Err(format!("Unsupported interval unit: {}", unit)),
                }
            }
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleType {
    Daily,
    Weekly,
    Monthly,
    Interval,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepDef {
    pub id: String,
    #[serde(default)]
    pub tool: Option<String>,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub prompt: Option<String>,
    #[serde(default)]
    pub params: Option<Value>,
    #[serde(default)]
    pub approve: bool,
    #[serde(default)]
    pub allowed_tools: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OutputDef {
    #[serde(rename = "type")]
    pub output_type: String,
    #[serde(default)]
    pub path: Option<String>,
    #[serde(default)]
    pub target: Option<String>,
    #[serde(default)]
    pub data: Option<String>,
}

// ── Runtime Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowSummary {
    pub id: String,
    pub name: String,
    pub enabled: bool,
    pub file_path: String,
    pub schedule_description: Option<String>,
    pub last_run_at: Option<String>,
    pub last_run_status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowRun {
    pub id: String,
    pub workflow_id: String,
    pub status: String,
    pub started_at: String,
    pub finished_at: Option<String>,
    pub steps: Vec<StepResult>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepResult {
    pub step_id: String,
    pub status: String,
    pub result: Option<Value>,
    pub error: Option<String>,
    pub started_at: String,
    pub finished_at: String,
}

// ── Helpers ──

fn parse_time(time_str: &str) -> Result<(u32, u32), String> {
    let parts: Vec<&str> = time_str.split(':').collect();
    if parts.len() != 2 {
        return Err(format!("Invalid time format: {}", time_str));
    }
    let hour: u32 = parts[0]
        .parse()
        .map_err(|_| format!("Invalid hour: {}", parts[0]))?;
    let minute: u32 = parts[1]
        .parse()
        .map_err(|_| format!("Invalid minute: {}", parts[1]))?;
    Ok((hour, minute))
}

fn day_to_cron(day: &str) -> Result<&str, String> {
    match day.to_lowercase().as_str() {
        "sunday" | "sun" => Ok("0"),
        "monday" | "mon" => Ok("1"),
        "tuesday" | "tue" => Ok("2"),
        "wednesday" | "wed" => Ok("3"),
        "thursday" | "thu" => Ok("4"),
        "friday" | "fri" => Ok("5"),
        "saturday" | "sat" => Ok("6"),
        _ => Err(format!("Unknown day: {}", day)),
    }
}
