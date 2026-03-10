use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;

use super::types::{StepResult, WorkflowRun};

pub struct WorkflowDb {
    pool: SqlitePool,
}

impl WorkflowDb {
    pub async fn new() -> Result<Self, String> {
        let db_dir = dirs::home_dir()
            .ok_or("Cannot determine home directory")?
            .join(".ral");

        std::fs::create_dir_all(&db_dir)
            .map_err(|e| format!("Failed to create ~/.ral: {}", e))?;

        let db_path = db_dir.join("workflow.db");

        let options = SqliteConnectOptions::new()
            .filename(&db_path)
            .create_if_missing(true);

        let pool = SqlitePoolOptions::new()
            .max_connections(2)
            .connect_with(options)
            .await
            .map_err(|e| format!("Failed to open workflow DB: {}", e))?;

        // Create tables
        sqlx::query(
            r#"
            CREATE TABLE IF NOT EXISTS workflow_runs (
                id TEXT PRIMARY KEY,
                workflow_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                finished_at TEXT,
                steps_json TEXT,
                error TEXT
            )
            "#,
        )
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to create workflow_runs table: {}", e))?;

        sqlx::query(
            "CREATE INDEX IF NOT EXISTS idx_workflow_runs_wid ON workflow_runs(workflow_id)",
        )
        .execute(&pool)
        .await
        .map_err(|e| format!("Failed to create index: {}", e))?;

        eprintln!("[workflow] DB initialized at {:?}", db_path);
        Ok(Self { pool })
    }

    pub async fn insert_run(&self, run: &WorkflowRun) -> Result<(), String> {
        let steps_json =
            serde_json::to_string(&run.steps).map_err(|e| format!("JSON error: {}", e))?;

        sqlx::query(
            r#"
            INSERT INTO workflow_runs (id, workflow_id, status, started_at, finished_at, steps_json, error)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&run.id)
        .bind(&run.workflow_id)
        .bind(&run.status)
        .bind(&run.started_at)
        .bind(&run.finished_at)
        .bind(&steps_json)
        .bind(&run.error)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("DB insert error: {}", e))?;

        Ok(())
    }

    pub async fn update_run(&self, run: &WorkflowRun) -> Result<(), String> {
        let steps_json =
            serde_json::to_string(&run.steps).map_err(|e| format!("JSON error: {}", e))?;

        sqlx::query(
            r#"
            UPDATE workflow_runs
            SET status = ?, finished_at = ?, steps_json = ?, error = ?
            WHERE id = ?
            "#,
        )
        .bind(&run.status)
        .bind(&run.finished_at)
        .bind(&steps_json)
        .bind(&run.error)
        .bind(&run.id)
        .execute(&self.pool)
        .await
        .map_err(|e| format!("DB update error: {}", e))?;

        Ok(())
    }

    pub async fn get_runs(
        &self,
        workflow_id: Option<&str>,
        limit: i64,
    ) -> Result<Vec<WorkflowRun>, String> {
        let rows: Vec<(String, String, String, String, Option<String>, Option<String>, Option<String>)> =
            if let Some(wid) = workflow_id {
                sqlx::query_as(
                    r#"
                    SELECT id, workflow_id, status, started_at, finished_at, steps_json, error
                    FROM workflow_runs
                    WHERE workflow_id = ?
                    ORDER BY started_at DESC
                    LIMIT ?
                    "#,
                )
                .bind(wid)
                .bind(limit)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| format!("DB query error: {}", e))?
            } else {
                sqlx::query_as(
                    r#"
                    SELECT id, workflow_id, status, started_at, finished_at, steps_json, error
                    FROM workflow_runs
                    ORDER BY started_at DESC
                    LIMIT ?
                    "#,
                )
                .bind(limit)
                .fetch_all(&self.pool)
                .await
                .map_err(|e| format!("DB query error: {}", e))?
            };

        Ok(rows.into_iter().map(row_to_run).collect())
    }

    pub async fn get_last_run(&self, workflow_id: &str) -> Result<Option<WorkflowRun>, String> {
        let row: Option<(String, String, String, String, Option<String>, Option<String>, Option<String>)> =
            sqlx::query_as(
                r#"
                SELECT id, workflow_id, status, started_at, finished_at, steps_json, error
                FROM workflow_runs
                WHERE workflow_id = ?
                ORDER BY started_at DESC
                LIMIT 1
                "#,
            )
            .bind(workflow_id)
            .fetch_optional(&self.pool)
            .await
            .map_err(|e| format!("DB query error: {}", e))?;

        Ok(row.map(row_to_run))
    }
}

fn row_to_run(
    row: (
        String,
        String,
        String,
        String,
        Option<String>,
        Option<String>,
        Option<String>,
    ),
) -> WorkflowRun {
    let steps: Vec<StepResult> = row
        .5
        .as_deref()
        .and_then(|s| serde_json::from_str(s).ok())
        .unwrap_or_default();

    WorkflowRun {
        id: row.0,
        workflow_id: row.1,
        status: row.2,
        started_at: row.3,
        finished_at: row.4,
        steps,
        error: row.6,
    }
}
