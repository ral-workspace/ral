---
description: Edit an existing .db.yaml database file. Use when the user asks to add rows, columns, or modify data in a database.
---

# Edit a .db.yaml Database

When the user asks to modify a database, read the existing `.db.yaml` file first, then apply changes.

## Common Operations

### Add rows
Append new entries to the `rows` array. Generate a unique `id` for each new row. Fill in `cells` matching the existing `schema` column ids.

### Add columns
Append a new entry to the `schema` array. If the column is `select` type, include `options`. Existing rows don't need the new column's cell — missing cells display as empty.

### Update cell values
Find the row by `id` and update the value under `cells.<column_id>`. Ensure the value matches the column type.

### Delete rows
Remove the row object from the `rows` array.

### Add a board view
Add a new view with `type: board` and `groupBy` pointing to a `select` column's `id`.

## Rules

1. Always read the file first before editing
2. Preserve existing row ids — never change them
3. Preserve existing column ids — never rename them (change `name` for display only)
4. Keep the YAML formatting clean and consistent
5. When adding many rows, generate unique ids (e.g. `r` + random alphanumeric)
6. Validate that `select` column values are within the defined `options`
