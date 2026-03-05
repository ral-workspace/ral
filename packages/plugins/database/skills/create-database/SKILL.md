---
description: Create a .db.yaml database file. Use when the user asks to create a database, task tracker, kanban board, or structured data table.
---

# Create a .db.yaml Database

When the user asks to create a database, generate a `.db.yaml` file. This file is rendered as a Notion-like table/board view in Helm.

## File Format

```yaml
name: Database Name
schema:
  - id: column_id        # lowercase snake_case, unique
    name: Display Name
    type: text            # text | number | select | checkbox | date
    options:              # only for "select" type
      - Option1
      - Option2
rows:
  - id: row1              # unique, alphanumeric
    cells:
      column_id: value    # keys match schema ids
views:
  - id: v1
    name: Table
    type: table
  - id: v2
    name: Board
    type: board
    groupBy: status       # column id to group by (for board view)
activeViewId: v1
```

## Column Types

| Type | Value Format | Example |
|------|-------------|---------|
| `text` | string | `"Auth implementation"` |
| `number` | number | `42` |
| `select` | one of options | `"In Progress"` |
| `checkbox` | boolean | `true` / `false` |
| `date` | YYYY-MM-DD string | `"2025-03-15"` |

## Rules

1. File extension MUST be `.db.yaml`
2. Every row needs a unique `id` (use short alphanumeric strings like `row1`, `row2`, or `r3k8f`)
3. Every column needs a unique `id` in snake_case
4. `select` columns MUST have an `options` array
5. Board views MUST have a `groupBy` field pointing to a `select` column
6. Include both `table` and `board` views when there's a `select` column suitable for grouping
7. Always include at least one `text` column as the primary/title field
8. Ask the user what columns they need if not specified

## Example: Sprint Task Tracker

```yaml
name: Sprint Tasks
schema:
  - id: title
    name: Title
    type: text
  - id: status
    name: Status
    type: select
    options:
      - Todo
      - In Progress
      - Done
  - id: priority
    name: Priority
    type: select
    options:
      - High
      - Medium
      - Low
  - id: due_date
    name: Due Date
    type: date
  - id: done
    name: Done
    type: checkbox
rows:
  - id: row1
    cells:
      title: Design auth flow
      status: In Progress
      priority: High
      due_date: "2025-03-20"
      done: false
views:
  - id: v1
    name: Table
    type: table
  - id: v2
    name: Board
    type: board
    groupBy: status
activeViewId: v1
```
