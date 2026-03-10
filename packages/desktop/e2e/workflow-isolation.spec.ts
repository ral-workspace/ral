import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_A = path.resolve(__dirname, "fixtures/project-a");
const FIXTURE_B = path.resolve(__dirname, "fixtures/project-b");

/**
 * Helper: execute async JS in the WebView context via WebDriver.
 * The script receives a `done` callback as the last argument.
 */
async function execAsync<T>(script: string): Promise<T> {
  return browser.executeAsync(script) as Promise<T>;
}

/**
 * Get workflow runs from the store for a given project.
 */
async function getWorkflowRuns(projectPath: string) {
  return execAsync<any[]>(`
    var done = arguments[arguments.length - 1];
    window.__TAURI__.core.invoke('workflow_get_runs', {
      projectPath: '${projectPath}',
      limit: 50,
    }).then(function(r) { done(r); }).catch(function(e) { done([]); });
  `);
}

/**
 * Run a workflow by ID in a given project.
 */
async function runWorkflow(projectPath: string, workflowId: string) {
  return execAsync<string>(`
    var done = arguments[arguments.length - 1];
    window.__TAURI__.core.invoke('workflow_run', {
      projectPath: '${projectPath}',
      workflowId: '${workflowId}',
    }).then(function(r) { done(r); }).catch(function(e) { done(null); });
  `);
}

/**
 * List workflows for a project.
 */
async function listWorkflows(projectPath: string) {
  return execAsync<any[]>(`
    var done = arguments[arguments.length - 1];
    window.__TAURI__.core.invoke('workflow_list', {
      projectPath: '${projectPath}',
    }).then(function(r) { done(r); }).catch(function(e) { done([]); });
  `);
}

describe("Workflow Project Isolation", () => {
  before(async () => {
    // Wait for app to fully initialize
    const splash = await $("#splash");
    await splash.waitForExist({ timeout: 15000, reverse: true });
    await browser.pause(2000);
  });

  it("running a workflow in Project A should not create runs in Project B", async () => {
    // Get baseline run counts
    const runsABefore = await getWorkflowRuns(FIXTURE_A);
    const runsBBefore = await getWorkflowRuns(FIXTURE_B);

    // List workflows in A and run the first one
    const workflowsA = await listWorkflows(FIXTURE_A);
    expect(workflowsA.length).toBeGreaterThan(0);

    const testFlow = workflowsA.find((w: any) => w.name === "Test Flow A");
    expect(testFlow).toBeDefined();

    await runWorkflow(FIXTURE_A, testFlow!.id);

    // Wait for workflow to complete
    await browser.pause(5000);

    // Verify: A has a new run
    const runsAAfter = await getWorkflowRuns(FIXTURE_A);
    expect(runsAAfter.length).toBeGreaterThan(runsABefore.length);

    // Verify: B has no new runs
    const runsBAfter = await getWorkflowRuns(FIXTURE_B);
    expect(runsBAfter.length).toBe(runsBBefore.length);
  });

  it("approval pending in Project A should not appear in Project B context", async () => {
    // Run the approval workflow in A
    const workflowsA = await listWorkflows(FIXTURE_A);
    const approvalFlow = workflowsA.find(
      (w: any) => w.name === "Test Approval A",
    );
    expect(approvalFlow).toBeDefined();

    const runId = await runWorkflow(FIXTURE_A, approvalFlow!.id);

    // Wait for approval event to fire
    await browser.pause(3000);

    // Verify: project B has no runs from project A's approval workflow
    const runsB = await getWorkflowRuns(FIXTURE_B);
    const leakedRuns = runsB.filter(
      (r: any) => r.workflow_id === approvalFlow!.id,
    );
    expect(leakedRuns.length).toBe(0);

    // Cancel the workflow to clean up
    if (runId) {
      await execAsync(`
        var done = arguments[arguments.length - 1];
        window.__TAURI__.core.invoke('workflow_cancel', { runId: '${runId}' })
          .then(function() { done(true); })
          .catch(function() { done(false); });
      `);
      await browser.pause(1000);
    }
  });

  it("run history should not mix between Project A and Project B", async () => {
    // Get runs for each project
    const runsA = await getWorkflowRuns(FIXTURE_A);
    const runsB = await getWorkflowRuns(FIXTURE_B);

    // All runs in A should have project_path matching FIXTURE_A (or null for legacy)
    for (const run of runsA) {
      if (run.project_path !== null) {
        expect(run.project_path).toBe(FIXTURE_A);
      }
    }

    // All runs in B should have project_path matching FIXTURE_B (or null for legacy)
    for (const run of runsB) {
      if (run.project_path !== null) {
        expect(run.project_path).toBe(FIXTURE_B);
      }
    }

    // No run in A should have B's project_path
    const crossContamination = runsA.filter(
      (r: any) => r.project_path === FIXTURE_B,
    );
    expect(crossContamination.length).toBe(0);
  });
});
