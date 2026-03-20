---
name: experience-evolution
description: Extract learned patterns and evolve the framework's knowledge base
trigger: End of significant sessions (feature completion, major refactor, architecture change)
---

# Experience Evolution Skill

## Purpose

The personalization framework should improve over time. After significant sessions, extract new knowledge and update the framework files.

## Steps

1. **Pattern extraction**
   - Review what was built or changed in this session
   - Identify any new patterns that were established (e.g., new error handling approach, new component structure)
   - Check if these patterns should be documented for future sessions

2. **Behaviors update check**
   - Read `.claude/rules/behaviors.md`
   - Are any rules outdated based on what happened this session?
   - Are there new rules that should be added?
   - Have any file paths, function names, or constants changed?
   - Update if needed, noting what changed and why

3. **Domain knowledge update**
   - Read `.claude/docs/behaviors-extended.md`
   - Did we learn new domain facts? (e.g., VinFast API behavior, EV range characteristics)
   - Are any documented algorithms now different from the actual code?
   - Update if needed

4. **Content safety update**
   - Read `.claude/docs/content-safety.md`
   - Did we encounter a new category of data that could be fabricated?
   - Add new rules if needed

5. **Component size audit**
   - Re-check line counts of files mentioned in `skill-triggers.md`
   - Update the "Current files near limit" list if sizes have changed

6. **Scaffolding checkpoint update**
   - Are there new "before you create" checks based on mistakes or decisions made?
   - Update `.claude/docs/scaffolding-checkpoint.md` if needed

## Output

```
Framework Evolution Report
==========================
Updated files:
- {file}: {what changed}

New patterns documented:
- {pattern description}

No changes needed:
- {file}: still accurate
```
