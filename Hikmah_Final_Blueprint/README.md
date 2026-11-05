# Hikmah Institute - Final Build Specification v2.0

**This archive contains a technical specification, database blueprint and coding agent instructions, not a completed app.** The information comes from the user's stated requirements, the one-page Shash Mahi exam schedule, and the 1448 Shash Mahi class result sheet structure. Real pupil names and marks are excluded.

## START HERE
1. Open `Hikmah_Institute_Final_Blueprint_v2.pdf` for the comprehensive illustrated blueprint.
2. Give the **entire ZIP** to the coding agent (or at minimum give `agent/BUILD_THIS_APP.md`, `spec/FINAL_REQUIREMENTS.md`, `spec/api_contract.yaml`, `db/*.sql`, and `examples/*.json`).
3. Tell it to implement Milestone A first, then continue milestone by milestone until all 22 acceptance tests pass.
4. The administrator must confirm unresolved attendance, grade, missing-paper and ranking policies **before final results can be published**. The draft/attendance setup can be built beforehand.

## Files
- `spec/FINAL_REQUIREMENTS.md` - authoritative full implementation requirements.
- `spec/IMPLEMENTATION_CHECKLIST.md` - milestones and release gates.
- `spec/api_contract.yaml` - key API contract endpoints and shapes.
- `agent/BUILD_THIS_APP.md` - copy-ready coding LLM instructions.
- `db/001_initial_baseline.sql` - initial PostgreSQL tables (v1 baseline).
- `db/002_v2_extension.sql` - v2 source-informed tables, guards and constraints. Apply after 001.
- `diagrams/*.png/.svg/.dot/.mmd` - organization, attendance, results ERDs plus workflow.
- `examples/*` - purely synthetic marks example, 11-paper/group config and CSV.
- `reference/SOURCE_ANALYSIS.md` - evidence/ambiguity summary, no pupil details.
- `Hikmah_Institute_Final_Blueprint_v2.pdf` - printable main report.

## Foundational data rules
The new example has **11 marked paper columns: 33+33+34+34+66+100+66+34+34+66+100 = 600**. The proposed six adjacent report groups sum to 100 each. The same display label (`تفسیر`) appears twice and must have two distinct paper IDs.

The screenshot does not establish the official grade thresholds, how Late/Leave count, the meaning of red blanks, or the official identities of the six groups. Do not infer these. Configure and approve them before publication.

## No sensitive student fixtures
Student names/grades from uploaded source material are deliberately omitted. Use `SYN-001` and `SYN-002` only.
