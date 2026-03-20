---
name: i18n-validation
description: Validate locale file sync between vi.json and en.json
trigger: Any file in src/locales/*.json is modified
---

# i18n Validation Skill

## Files to Check
- `src/locales/vi.json` — Vietnamese (primary)
- `src/locales/en.json` — English (translation)

## Steps

1. **Key parity check**
   - Read both JSON files
   - Extract all top-level keys from each
   - Report keys in vi.json but missing from en.json
   - Report keys in en.json but missing from vi.json
   - Both files must have identical key sets

2. **Interpolation param check**
   - For each key, extract `{{paramName}}` placeholders
   - Verify both locale files use identical param names for each key
   - Flag any mismatch (e.g., vi has `{{vehicle}}` but en has `{{car}}`)

3. **Untranslated string detection**
   - Check en.json for values that look Vietnamese (contain diacritics: ă, â, đ, ê, ô, ơ, ư)
   - Check vi.json for values that look English-only (no Vietnamese characters, >5 words)
   - Flag likely untranslated entries

4. **Key naming convention**
   - All keys must be `snake_case`
   - Flag any keys using camelCase, PascalCase, or kebab-case

5. **Vietnamese tone check**
   - In vi.json, check for first-person references ("Mình", "Tôi") — should use "Duy" (third-person)
   - Flag any violations of the Vietnamese writing style from CLAUDE.md

## Output Format

```
i18n Validation Report
======================
Total keys — vi: {N}, en: {N}

Missing from en.json:
- {key}

Missing from vi.json:
- {key}

Interpolation mismatches:
- {key}: vi={{params}}, en={{params}}

Possibly untranslated:
- {key}: {value}

Naming violations:
- {key}: should be {corrected_key}

Vietnamese tone issues:
- {key}: found "{word}", should use "Duy"
```
