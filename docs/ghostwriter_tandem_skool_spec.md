# GHOSTWRITER TANDEM — SKOOL COMMUNITY SPECIFICATION
Version: 1.0 | Date: 2026-05-08 | Status: ACTIVE

## 1. Community Identity

```yaml
community_name: "Ghostwriter Tandem"
platform: "Skool"
url_slug: "ghostwriter-tandem"
privacy: "private"
visibility: "hidden_from_search"
access_model: "request_only"
price: "free"
admin_email: "rajabey68@gmail.com"
purpose: "Closed collaboration workspace for authors working on sector-specific books under the Scale Advisory Foundry"
```

## 2. Module Structure

```yaml
modules:
  - id: "the_legal"
    display_name: "📁 The Legal"
    order: 1
    status: "active"
    project: "The Digital Law Firm"
    publisher: "Law Society Publishing"
    deadline: "Q2 2026"
    access: "restricted — The Legal members only"

  - id: "the_financial_services"
    display_name: "📁 The Financial Services"
    order: 2
    status: "reserved"

  - id: "the_construction"
    display_name: "📁 The Construction"
    order: 3
    status: "reserved"
```

## 3. The Legal — Chapter Registry

```yaml
chapters:
  - { id: ch01, title: "The AI Readiness Audit",        lead: "Rajiv",  status: "COMPLETE",     version: "v2.0" }
  - { id: ch02, title: "The Pricing Paradox",            lead: "Darren", status: "COMPLETE",     version: "v1.0" }
  - { id: ch03, title: "The 90-Day Pilot",               lead: "Rajiv",  status: "IN PROGRESS"  }
  - { id: ch04, title: "The Safety Scaffolding",         lead: "Rajiv",  status: "DRAFT READY", contributors: ["Sushila"] }
  - { id: ch05, title: "The Technology Stack",           lead: "Rajiv",  status: "IN PROGRESS"  }
  - { id: ch06, title: "The Partnership Conversation",   lead: "Darren", status: "PENDING"       }
  - { id: ch07, title: "The Legal Framework",            lead: "Nick",   status: "PENDING"       }
  - { id: ch08, title: "The Governance Model",           lead: "Nick",   status: "PENDING", contributors: ["Sushila"] }
  - { id: ch09, title: "The EU AI Act Roadmap",          lead: "Nick",   status: "PENDING"       }
  - { id: ch10, title: "The Delivery Engine",            lead: "Rajiv",  status: "PENDING"       }
  - { id: ch11, title: "The Change Management",          lead: "Darren", status: "PENDING"       }
  - { id: ch12, title: "The First Year Forward",         lead: "Darren", status: "PENDING"       }
```

## 4. Member Registry

```yaml
members:
  - name: "Rajiv Abeysinghe"
    email: "rajabey68@gmail.com"
    skool_role: "Admin"
    chapters: [1, 3, 4, 5, 10]

  - name: "Nick Lockett"
    email: "nick.lockett@gmail.com"
    skool_role: "Moderator"
    chapters: [7, 8, 9]
    authority: "SRA compliance, Tier 1 legal source validation"

  - name: "Darren Sylvester"
    email: "darrenjsylvester@hotmail.com"
    skool_role: "Moderator"
    chapters: [2, 6, 11, 12]
    authority: "Practice management, client scenarios, reader personas"

  - name: "Sushila Nair"
    email: "nairsushi@gmail.com"
    skool_role: "Contributor"
    chapters: [4, 8]
    authority: "ISO 27001, ISACA, cyber risk"
```

## 5. Pinned Posts — The Legal Module

| Post | Owner |
|------|-------|
| 📋 Project Brief & Timeline | Rajiv |
| 📐 Writing Standards (Voice, Style, Kill List) | Rajiv |
| 🔍 Evidence Hierarchy & Citation Protocol | Rajiv |
| 📊 Four-Eyes Verification Framework | Rajiv |
| 📝 Author Responsibilities Matrix | Rajiv |

## 6. File Upload Rules

```yaml
naming_convention: "Chapter_{NN}_{TitleCamelCase}_v{X.X}_{YYYYMMDD}.docx"
examples:
  - "Chapter_01_AIReadinessAudit_v2.0_20260508.docx"
  - "Chapter_07_LegalFramework_v1.0_20260601.docx"

version_policy:
  - Never delete old versions — archive in post comments
  - Each upload requires a change log comment (v{X.X} — max 3 bullet points)

source_library:
  tier_1_only: true
  accepted: [sra.org.uk, lawsociety.org.uk, eur-lex.europa.eu, legislation.gov.uk,
             "Law Society Gazette (named journalist + date)",
             "Legal Futures (named journalist + date)",
             "Thomson Reuters legal reports (named, dated)"]
```

## 7. Comment & Tagging Protocol

| Tag | SLA | Meaning |
|-----|-----|---------|
| [BLOCKER] | 24h | Tag Rajiv + all relevant authors |
| [QUESTION] | 3 business days | |
| [SUGGESTION] | 5 business days | Optional response |
| [APPROVED] | — | Sign-off by lead author |
| [VERIFIED] | — | Citation independently checked |

**Mention routing:** @Nick Lockett → SRA/regulatory | @Darren Sylvester → practice management | @Sushila Nair → security/governance | @Rajiv Abeysinghe → escalations/final approval

## 8. BMAD Agent Mapping

| Step | Agent | Model | Output |
|------|-------|-------|--------|
| 1 | Analyst | claude-sonnet-4-6 + NotebookLM | Research brief + annotated source list |
| 2 | Architect | claude-opus-4-6 | Structured argument + compliance check |
| 3 | Drafter | claude-sonnet-4-6 / claude-opus-4-6 | Chapter draft + Kill List check + citation check |
| 4 | Four-Eyes/HITL | Human | APPROVED or revision request |

Upload gates: Drafter output → PENDING HITL REVIEW → Four-Eyes → APPROVED → COMPLETE

## 9. Local Source Files

```yaml
local_path: "~/Library/CloudStorage/GoogleDrive-rajabey68@gmail.com/My Drive/Digital Law firms/Book Method/Bookv0.1/Bookv0.1/"
files: [Chapter_01.docx … Chapter_12.docx]
rename_on_upload: true
rename_pattern: "Chapter_{NN}_{TitleCamelCase}_v1.0_{YYYYMMDD}.docx"
```

## 10. Integration

```yaml
zapier:
  requires: "Skool Pro plan"
  triggers:
    - new_paid_member → add row to Google Sheets member registry
    - membership_question_answered → capture to Google Drive intake folder

gmail_drafts:
  account: "rajabey68@gmail.com"
  status: "DRAFT — awaiting Skool invite link"
  recipients:
    - nick.lockett@gmail.com
    - darrenjsylvester@hotmail.com
    - nairsushi@gmail.com
  action: "Insert invite link, then send all three"
```

---
*Spec saved: 2026-05-08 | Source: Ghostwriter Tandem Skool community design session*
