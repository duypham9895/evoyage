# eVoyage Agent Team

Project-specific agent roster that complements global agents at `~/.claude/agents/`.

## The Team

### Strategic Roles (Decision-makers)
| Agent | Role | When to Use |
|-------|------|-------------|
| **head-of-product** | Product strategy, prioritization, PRDs | Before building new features, scope decisions |
| **head-of-design** | Design system, visual hierarchy, UX flows | Before designing UI, layout decisions |
| **head-of-engineering** | Architecture, tech debt, code health | Before major refactors, dependency changes |

### Specialist Roles (Builders & Reviewers)
| Agent | Role | When to Use |
|-------|------|-------------|
| **senior-frontend** | React components, state, performance | Building/refactoring components |
| **senior-backend** | API routes, database, external APIs | Building/modifying API endpoints |
| **qa-lead** | Testing strategy, regression, user flows | After implementation, before deploy |
| **devsecops** | Security, deployment, infrastructure | Before deploy, security concerns |

### Research & Content Roles
| Agent | Role | When to Use |
|-------|------|-------------|
| **ux-researcher** | User behavior, feedback analysis, personas | Validating design decisions, analyzing feedback |
| **content-writer** | Bilingual copy, error messages, marketing | Adding locale strings, writing UI text |

### Technical Reviewers (from Layer 0)
| Agent | Role | When to Use |
|-------|------|-------------|
| **map-reviewer** | Map/geo code across 3 providers | Map component or routing lib changes |
| **i18n-checker** | Locale sync, translation quality | Locale file changes |
| **ux-auditor** | "Less Icons" philosophy enforcement | Any component UI changes |

## Agent-to-File Routing

### By file path
| Path Pattern | Primary Agent | Secondary |
|-------------|---------------|-----------|
| `src/components/Map*.tsx` | map-reviewer | senior-frontend |
| `src/components/landing/*` | ux-auditor | content-writer |
| `src/components/**/*.tsx` | senior-frontend | ux-auditor |
| `src/lib/osrm.ts`, `src/lib/mapbox-*`, `src/lib/google-*` | map-reviewer | senior-backend |
| `src/lib/route-planner.ts`, `station-ranker.ts`, `station-finder.ts` | senior-backend | head-of-engineering |
| `src/lib/vinfast-*.ts` | senior-backend | devsecops |
| `src/app/api/**` | senior-backend | devsecops |
| `src/locales/*.json` | i18n-checker | content-writer |
| `src/lib/locale.tsx` | i18n-checker | senior-frontend |
| `prisma/schema.prisma` | senior-backend | head-of-engineering |
| `next.config.ts` | devsecops | head-of-engineering |
| `.github/workflows/*` | devsecops | — |
| `src/app/globals.css` | head-of-design | senior-frontend |
| `docs/**`, `CLAUDE.md` | head-of-product | — |

## Workflow Patterns

### New Feature
```
1. head-of-product  → "Should we build this? What's the scope?"
2. head-of-design   → "How should it look and feel?"
3. ux-researcher    → "What do users actually need?"
4. head-of-engineering → "How should we architect this?"
5. content-writer   → "What text/copy do we need?"
6. senior-frontend + senior-backend → Build (parallel if independent)
7. qa-lead          → Test
8. ux-auditor + i18n-checker → Review (parallel)
9. devsecops        → Pre-deploy security check
```

### Bug Fix
```
1. qa-lead          → Reproduce and document
2. senior-frontend or senior-backend → Fix (based on where bug lives)
3. qa-lead          → Verify fix + regression check
```

### Design Change
```
1. head-of-design   → Design review
2. ux-researcher    → User impact assessment
3. content-writer   → Update copy if needed
4. senior-frontend  → Implement
5. ux-auditor       → Verify "Less Icons" compliance
```

### Pre-Deployment
```
Run in parallel:
- qa-lead           → Regression checklist
- devsecops         → Security audit
- i18n-checker      → Locale sync
- ux-auditor        → UI review
```

## Parallel Execution Rules

1. **Always parallel**: ux-auditor + i18n-checker (no shared state)
2. **Always parallel**: senior-frontend + senior-backend (different file scopes)
3. **Always parallel**: qa-lead + devsecops (pre-deploy checks)
4. **Sequential**: head-of-product → head-of-design → implementation agents
5. **Sequential**: build agents → qa-lead → devsecops → deploy

## Combining with Global Agents
- After code change: global `code-reviewer` + relevant project agent(s) in parallel
- For new features: global `planner` → project `head-of-product` for validation
- For bugs: global `debugger` + project `qa-lead` in parallel
- For architecture: global `architect` + project `head-of-engineering` in parallel
