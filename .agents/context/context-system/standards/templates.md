<!-- Context: context-system/standards/templates | Priority: high | Version: 1.0 | Updated: 2026-08-17 -->

# MVI templates

Every context file follows this shape (<200 lines, one topic).

## Template (content file)

```markdown
<!-- Context: <category>/<subfolder>/<file> | Priority: high | Version: 1.0 | Updated: YYYY-MM-DD -->

# <Title>

Purpose: one or two sentences.

## Key points

- Point 1
- Point 2
- Point 3

## Example

(snippet, <10 lines)

## References

- source file paths or links
```

## Template (navigation.md)

```markdown
<!-- Context: <category>/navigation | Priority: high | Version: 1.0 | Updated: YYYY-MM-DD -->

# <Category>

Purpose.

## Files

| File            | Topic | Priority |
| --------------- | ----- | -------- |
| [name](file.md) | topic | priority |

## Related

- links to other categories
```
