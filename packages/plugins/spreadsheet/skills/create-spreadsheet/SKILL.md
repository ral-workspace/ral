---
description: Create an Excel (.xlsx) spreadsheet. Use when the user asks to create a spreadsheet, Excel file, or tabular data export.
---

# Create an Excel Spreadsheet

When the user asks to create a spreadsheet, generate a `.xlsx` file using `openpyxl`.

## Setup

First, ensure `openpyxl` is installed:

```bash
pip install openpyxl
```

## Python Script Template

```python
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
from openpyxl.utils import get_column_letter

wb = Workbook()
ws = wb.active
ws.title = "Sheet1"

# --- Styling ---
header_font = Font(bold=True, size=12, color="FFFFFF")
header_fill = PatternFill(start_color="4472C4", end_color="4472C4", fill_type="solid")
header_alignment = Alignment(horizontal="center", vertical="center")
thin_border = Border(
    left=Side(style="thin"),
    right=Side(style="thin"),
    top=Side(style="thin"),
    bottom=Side(style="thin"),
)

# --- Headers ---
headers = ["Name", "Category", "Amount", "Date"]
for col_idx, header in enumerate(headers, 1):
    cell = ws.cell(row=1, column=col_idx, value=header)
    cell.font = header_font
    cell.fill = header_fill
    cell.alignment = header_alignment
    cell.border = thin_border

# --- Data ---
data = [
    ["Item A", "Sales", 1500, "2025-03-01"],
    ["Item B", "Marketing", 2300, "2025-03-05"],
]
for row_idx, row_data in enumerate(data, 2):
    for col_idx, value in enumerate(row_data, 1):
        cell = ws.cell(row=row_idx, column=col_idx, value=value)
        cell.border = thin_border

# --- Column widths ---
for col_idx in range(1, len(headers) + 1):
    ws.column_dimensions[get_column_letter(col_idx)].width = 18

# --- Freeze header row ---
ws.freeze_panes = "A2"

wb.save("output.xlsx")
print("Created: output.xlsx")
```

## Rules

1. Always use `openpyxl` — do not use other libraries
2. Always style the header row (bold, fill color, centered)
3. Apply thin borders to all data cells
4. Set reasonable column widths based on content
5. Freeze the header row with `ws.freeze_panes = "A2"`
6. Use appropriate data types — numbers as `int`/`float`, not strings
7. Save to the user's requested path, or default to current directory
8. After creating the file, tell the user they can open it in the app to preview

## Common Patterns

### Number formatting
```python
from openpyxl.styles.numbers import FORMAT_NUMBER_COMMA_SEPARATED1
cell.number_format = FORMAT_NUMBER_COMMA_SEPARATED1  # 1,000
cell.number_format = '#,##0.00'  # 1,000.00
cell.number_format = '0%'  # percentage
cell.number_format = 'yyyy-mm-dd'  # date
```

### Formulas
```python
ws.cell(row=10, column=3, value="=SUM(C2:C9)")
ws.cell(row=10, column=3, value="=AVERAGE(C2:C9)")
```

### Multiple sheets
```python
ws2 = wb.create_sheet(title="Summary")
```

### Merge cells
```python
ws.merge_cells("A1:D1")
```

### Conditional formatting
```python
from openpyxl.formatting.rule import CellIsRule
red_fill = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
ws.conditional_formatting.add("C2:C100",
    CellIsRule(operator="lessThan", formula=["0"], fill=red_fill))
```

## Spreadsheet Types

| Type | Description |
|------|-------------|
| Data table | Headers + rows of data |
| Financial report | Revenue/expenses with formulas and totals |
| Inventory | Items with quantities, prices, totals |
| Schedule | Dates, times, assignments |
| Dashboard | Summary sheet with formulas referencing data sheets |
