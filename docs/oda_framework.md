# Objective-Driven Adoption (ODA)
### A Framework for AI Implementation in UK Law Firms

**Status:** Roadmap — pending author review and community discussion  
**Classification:** Appendix / Sidebar / Skool Community Topic  
**Owner:** Rajiv Abeysinghe  
**Last updated:** 2026-05-09

---

## The One-Line Version

> Define the win before you buy the tool.

---

## The Problem ODA Solves

Most law firm AI projects fail not because the technology is wrong but because nobody defined what "right" looked like before they started. The tool gets deployed, people use it differently, and six months later no one can say whether it worked.

ODA borrows from software engineering's most battle-tested discipline — Test-Driven Development (TDD) — and applies it to AI adoption.

---

## The TDD Parallel

In TDD, developers write the test before the code. The test defines what "done" means. You only write enough code to pass it.

| TDD | ODA |
|-----|-----|
| Write the failing test first | Define the measurable objective first |
| **Red** — behaviour doesn't exist yet | **Baseline** — measure current state (Shadow Efficiency) |
| Write minimum code to pass | Deploy minimum AI to hit the objective |
| **Green** — test passes | **Verify** — objective achieved |
| Refactor | Scale, automate, or promote to next pilot |
| Test suite protects future changes | Objective register prevents scope creep |

---

## The Five Phases

### 1. DEFINE — Write the objective
State the outcome in measurable terms before any technology is selected.

> *"Emily will spend 30 minutes on a standard probate letter, not 90."*

A valid objective has three parts: **who**, **what**, and **by how much**.  
If you cannot state the number, the objective is not ready.

### 2. BASELINE — Measure current state
Run the Shadow Efficiency Calculator. Record the real number — not the estimate, not the target. This is your Red: the test that currently fails.

> *"Emily spends 87 minutes on average. Target: 30 minutes. Gap: 57 minutes."*

### 3. IMPLEMENT — Minimum viable AI
Select the smallest intervention that could close the gap. Resist the urge to deploy everything at once. In TDD, you write the minimum code to pass the test. In ODA, you deploy the minimum AI to hit the objective.

> *"Deploy the probate letter template engine. Nothing else this month."*

### 4. VERIFY — Does the objective pass?
After 30 days, re-run the measurement. Did Emily hit 30 minutes?

- **Pass** → promote to production, move to next objective
- **Fail** → diagnose the gap, adjust implementation, re-run (do not change the objective)
- **Inconclusive** → extend the trial, not the scope

### 5. SCALE — The objective register
Every passed objective is logged. The register becomes the firm's evidence base for ROI, SRA inspection readiness, and PI insurance renewal. It is the test suite that protects future changes.

---

## The Genetic Mindset

In genetic algorithms, a **fitness function** determines which solutions survive. Weak solutions are discarded. Strong ones propagate.

ODA treats the objective as the fitness function. AI implementations that satisfy it are promoted. Those that do not are discarded or mutated. The firm runs evolutionary pressure against a defined outcome — not against a vendor's feature list or a partner's enthusiasm.

This is why ODA scales: each passed objective becomes the baseline for the next. The firm gets progressively better at defining fitness, running trials, and selecting what works.

---

## Acronym Reference

| Term | Meaning | Where used |
|------|---------|-----------|
| **ODA** | Objective-Driven Adoption | Framework name (technical/CIO audiences) |
| **Outcome-First** | Plain-English equivalent | Practitioner / partner audiences |
| **Shadow Efficiency** | Baseline measurement method | Ch01, Ch02, Ch03 |
| **Red / Green** | Fail / Pass state (borrowed from TDD) | Pilot review language |
| **Fitness Function** | The objective that determines whether an implementation survives | Strategic / governance layer |
| **Objective Register** | Cumulative log of defined and passed objectives | Ch08 Governance Model |

---

## Candidate Skool Community Topics

These questions are suitable for a [QUESTION] post in Ghostwriter Tandem:

1. **"Define the Win"** — how should firms articulate an objective that is specific enough to be testable? What makes a bad objective?
2. **Fitness functions in law** — what does "passing the test" look like for regulatory compliance objectives vs efficiency objectives?
3. **ODA vs Agile** — some firms already run Agile sprints. How does ODA sit alongside or replace existing project methodologies?
4. **The Objective Register as SRA evidence** — can a well-kept objective register serve as documentation of responsible AI adoption for an SRA inspection?

---

## Possible Placements in the Book

| Location | Why |
|----------|-----|
| Appendix A | Standalone reference — readers who want the framework can find it without it interrupting the narrative |
| Ch03 sidebar (90-Day Pilot) | The pilot IS ODA in practice — a natural anchor |
| Ch12 closing framework | Ties the entire 12-chapter journey into a repeatable system |
| Law Society Publishing foreword supplement | Positions the book as a methodology, not just a guide |

---

## Status Tags

- [ ] Author review: @Rajiv Abeysinghe
- [ ] Community discussion: Ghostwriter Tandem Skool — [QUESTION] post pending
- [ ] Placement decision: Appendix vs Ch03 vs Ch12
- [ ] "How Not to Write Like AI" style pass before finalisation
- [ ] Legal/regulatory sense-check: Nick Lockett (@Nick Lockett) — does ODA language conflict with any SRA framework terminology?
