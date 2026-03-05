---
description: Create a PowerPoint (.pptx) presentation. Use when the user asks to create a presentation, slides, or deck.
---

# Create a PowerPoint Presentation

When the user asks to create a presentation, generate a `.pptx` file using `python-pptx`.

## Setup

First, ensure `python-pptx` is installed:

```bash
pip install python-pptx
```

## Approach

Write a Python script that uses `python-pptx` to create the presentation, then execute it.

## Python Script Template

```python
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)

# Slide layouts
BLANK = prs.slide_layouts[6]  # Blank layout

def add_slide(title_text, bullets=None, layout=BLANK):
    slide = prs.slides.add_slide(layout)

    # Title
    left = Inches(0.8)
    top = Inches(0.6)
    width = Inches(11.7)
    height = Inches(1.2)
    txBox = slide.shapes.add_textbox(left, top, width, height)
    tf = txBox.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    p.text = title_text
    p.font.size = Pt(36)
    p.font.bold = True
    p.font.color.rgb = RGBColor(0x1A, 0x1A, 0x2E)

    # Bullets
    if bullets:
        left = Inches(0.8)
        top = Inches(2.0)
        width = Inches(11.7)
        height = Inches(4.5)
        txBox = slide.shapes.add_textbox(left, top, width, height)
        tf = txBox.text_frame
        tf.word_wrap = True
        for i, bullet in enumerate(bullets):
            p = tf.add_paragraph() if i > 0 else tf.paragraphs[0]
            p.text = bullet
            p.font.size = Pt(20)
            p.font.color.rgb = RGBColor(0x33, 0x33, 0x33)
            p.space_after = Pt(12)

    return slide

# --- Build slides ---
add_slide("Title Slide", ["Subtitle or description"])
add_slide("Agenda", ["Item 1", "Item 2", "Item 3"])

prs.save("output.pptx")
print("Created: output.pptx")
```

## Rules

1. Always use `python-pptx` — do not use other libraries
2. Use blank slide layout (`slide_layouts[6]`) and position elements manually for full control
3. Set widescreen dimensions: `Inches(13.333) x Inches(7.5)`
4. Use readable font sizes: titles `Pt(32-44)`, body `Pt(18-24)`
5. Keep text concise — presentations should be visual, not walls of text
6. Use `RGBColor` for consistent branding colors
7. Save to the user's requested path, or default to current directory
8. After creating the file, tell the user they can open it in the app to preview

## Slide Types to Support

| Type | Description |
|------|-------------|
| Title slide | Large centered title + subtitle |
| Bullet points | Title + bullet list |
| Two-column | Side-by-side content |
| Image + text | Image on one side, text on other |
| Quote | Large centered quote text |
| Section divider | Bold section title, different background |

## Styling Tips

- Use `slide.background.fill.solid()` + `RGBColor` for colored backgrounds
- Use `MSO_SHAPE` for decorative shapes (rectangles, circles)
- Add shapes with `slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, left, top, width, height)`
- For emphasis, use contrasting background colors on section dividers
