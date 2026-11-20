# Domain Docs

How the engineering skills should consume this repo's domain documentation.

## Before exploring, read these

- **`docs/GLOSSARY.md`**: the product language. Use its terms; never the words it lists under _Avoid_.
- **`docs/ARCHITECTURE.md`**: layers, layout, seams and data ownership, plus the subject docs its Subjects table lists for the area you touch.
- **`docs/decisions/`**: read the records that touch the area you're about to work in.

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `docs/GLOSSARY.md`. If the concept you need isn't there, either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it).

## Flag decision conflicts

If your output contradicts a decision record, surface it explicitly rather than silently overriding:

> _Contradicts 0003 (zero-knowledge Relay), but worth reopening because…_
