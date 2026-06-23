# OHSMS Portal — Product Requirements Document

> Living spec for an enterprise Occupational Health & Safety Management System (OHSMS) aligned to ISO 45001:2018, with the multi-tenant, multi-site operational model required by industrial customers (manufacturing, construction, oil & gas, healthcare, logistics, utilities).

| Field | Value |
|---|---|
| Document type | Product Requirements Document (PRD) |
| Status | Living — updated alongside the codebase |
| Owning team | Product + Engineering |
| Compliance frameworks | ISO 45001:2018 (primary), OSHA 29 CFR 1910 (US), IS 2190 / IS 14489 (India), EU OSH Framework Directive 89/391, GDPR (data subjects), SOC 2 Type II (controls), ISO 27001 (security) |
| Reference architecture | React 19 SPA + Firebase RTDB + Auth + Storage + Vercel serverless; per-org Firebase project (multi-tenant by deployment isolation) |

---

## 1. Executive summary

OHSMS Portal lets a single organisation — or a multi-site enterprise — run their entire occupational health & safety system from one platform: report and investigate incidents, run hazard / risk assessments, raise CAPAs, issue Permits-to-Work, control hazardous-energy isolation (LOTO), schedule and execute audits and inspections, manage training and competency, onboard contractors and their workers, run mock drills, track emergency equipment readiness, and surface the live state of safety performance through dashboards and analytics. Field workers and contractors get purpose-built mobile-first surfaces; auditors get a complete, immutable evidence trail.

The product targets **mid-market and enterprise customers** (~100 to 50,000 employees per organisation, 1 to 500 sites) and is sold on a **per-organisation, per-site licensing model** with a hosted multi-tenant deployment as the default and a per-tenant Firebase project model for customers with data-sovereignty requirements.

## 2. Problem statement & market

### 2.1 Why this exists

The cost of occupational injury and ill-health is staggering: ILO estimates **2.78 million workplace fatalities per year** and a global economic cost of ~4% of GDP. Beneath the fatal accidents sit ~340 million non-fatal injuries and ~160 million occupational diseases. Regulatory frameworks (ISO 45001, OSHA, EU OSH Framework, India Factories Act) require organisations to **demonstrate** they manage these risks through documented systems, not just intent.

In practice, most mid-market organisations still run their OHSMS on:

- **Disconnected tools**: Excel registers for hazards, paper PTWs at the gatehouse, email for CAPA, a separate LMS for training, WhatsApp groups for incident reports
- **Spreadsheet sprawl**: 30+ trackers per site, no single source of truth, no real-time dashboard, no audit trail
- **Manual audit prep**: weeks of evidence gathering before every external audit
- **Reactive culture**: incidents recorded after they happen, no leading indicators, no closed loop from observation → action → verification

This produces three classes of failure: **regulatory** (audit findings, fines, plant shutdowns), **operational** (repeat incidents, downtime, insurance premiums), and **reputational** (visible workplace incidents on social media, contract loss to competitors who *can* demonstrate ISO 45001 certification).

### 2.2 Market opportunity

| Segment | TAM characteristics |
|---|---|
| Mid-market manufacturing (100–5,000 employees) | Largest segment; ~250k orgs globally; ISO 45001 certification growing 15% YoY |
| Construction & contracting | Highest PTW + LOTO + contractor-mgmt intensity; per-project deployments common |
| Oil & gas / petrochemical | Highest regulatory load; demand audit-grade evidence trails |
| Healthcare (hospital networks) | Health surveillance + vaccination tracking + occupational illness emphasis |
| Logistics / utilities | Multi-site (often 100+), high field-worker proportion, high mock-drill cadence |

### 2.3 Competitive landscape

| Tier | Players | Where we win |
|---|---|---|
| Enterprise suites | Enablon, Intelex, Cority, Sphera, VelocityEHS | Lower TCO, faster deployment, less consulting, modern UX |
| Mid-market | EcoOnline, Donesafe, Safesite, SafetyCulture (iAuditor) | Broader OHSMS scope, multi-site native, contractor + vendor portals built in |
| Point tools | Form.com, Procore (PTW), KPA | Single integrated system vs 4–6 stitched tools |
| In-house / Excel | SharePoint + Forms + macros | We replace 30+ spreadsheets; persistent audit trail; live dashboards |

## 3. Product vision & principles

### 3.1 Vision (3-year)

> Every operational organisation should be able to run an ISO 45001-grade health & safety system on day one — without consultants, without per-module integrations, without compromising on enterprise security — and demonstrate it to an external auditor in under an hour.

### 3.2 Design principles

1. **Audit-trail first.** Every write is logged with actor, timestamp, before/after diff. The audit log is immutable; even Global Owners cannot edit it.
2. **Site-scoped by default.** Multi-site is the norm, not the exception. Every collection respects site scoping unless explicitly global.
3. **Mobile-equal.** Field workers, contractors, and vendors get UIs that work on a 4-inch phone in PPE gloves, not just managers on a desktop.
4. **Compliance-shaped data model.** Records map directly to ISO 45001 clauses, OSHA forms (300/301/300A), and IS 2190 fields — no transformation layer needed at audit time.
5. **No abandoned work.** Anything started (a CAPA, a permit, an inspection) is tracked to closure or explicit cancellation. Reminders surface what's overdue.
6. **Multi-tenant without leakage.** Per-org data isolation enforced by RTDB rules + path scoping + (Phase 2) per-org Firebase project deployment.
7. **Server-side trust boundary.** Privileged operations (user provisioning, custom claims, attachment delete) run server-side with Admin SDK; the client never holds a privileged credential.
8. **Documents are evidence.** Every uploaded file is content-typed, size-capped, hashed (sha256), and tied to a record with retention metadata.

## 4. Target personas

### 4.1 Operational personas

| # | Persona | Surface | Jobs-to-be-done | Pain points today | Success looks like |
|---|---|---|---|---|---|
| 1 | **HSE Manager / Global Safety Director** | Main portal — Dashboard, Analytics, all modules | Set policy, monitor leading + lagging indicators, prep for external audits, allocate resources across sites, sign off CAPA closures | 6 hours/week consolidating site spreadsheets; can't answer "show me everything overdue today" in real time | One pane shows safety health of every site, drill into any record, export audit-ready PDF in one click |
| 2 | **Site Safety Officer** | Main portal — Incidents, PTW, LOTO, Inspections, Mock Drill, Health | Investigate incidents, issue permits, drive routine inspections, close out CAPAs assigned to them | Paper PTW workflow takes 20+ minutes per permit; no visibility into other sites' lessons-learnt | Permit issued in <2 min; daily action list <10 items; closes ≥80% of CAPAs on time |
| 3 | **Field Worker / Operator** | Field Portal (mobile) | Report a hazard or near-miss in <30 sec, sign a permit, look up emergency equipment, check today's tasks | No tool on the floor — has to find a kiosk or wait until end-of-shift | Photo + voice note + tap-to-submit hazard report; works on shared device with QR-based authentication |
| 4 | **Contractor Administrator** | Vendor Portal | Submit company docs (insurance, registration), upload worker credentials (medical, training), get visibility into open PTWs assigned to their crew | Sends docs by email; no acknowledgement; finds out at the gatehouse that a worker isn't compliant | Self-serve doc upload with expiry reminders; sees which workers are ready to be on site today |
| 5 | **Contractor Worker (subcontractor)** | Field Portal (mobile) — limited scope | Sign their PTW acknowledgement, complete pre-task safety briefing, report a hazard on site | No system access at all today — supervisor signs on their behalf | QR-scan onto a permit, e-signature in app, instant evidence trail |
| 6 | **Executive / Board** | Dashboard + Analytics (read-only) | Track LTIFR, TRIFR, severity trends, CAPA closure rate, contractor performance | Monthly PowerPoint compiled by HSE Manager; data is 3 weeks stale | Real-time, drill-down, exportable PDF/Excel — no manual prep |
| 7 | **External Auditor (ISO 45001 cert body, OSHA inspector, client second-party)** | Main portal — read-only "Auditor" role (planned) | Verify evidence for ISO 45001 clauses 6–10, sample CAPAs, check competency records | 1–2 weeks of doc gathering before site visit; auditor relies on what's offered, can't sample freely | Direct read-only access to the live system; randomly samples records; downloads audit report bundle |
| 8 | **IT / DevOps Admin** | Settings, Users, Database Setup, GitHub Actions | Onboard new orgs, manage Firebase project, roll out updates, manage incident response | Per-customer deploys are manual; secrets rotation is ad-hoc; no audit of admin actions | One-click onboarding wizard; secrets in GitHub Environments; admin actions in the same audit log as everyone else |

### 4.2 Persona priorities (this release)

Primary build target: **Persona 1 (HSE Manager)** and **Persona 2 (Site Safety Officer)** — they sign the contract and own the data quality.
Secondary: **Persona 3 (Field Worker)** and **Persona 4 (Contractor Admin)** — they make or break adoption.
Tertiary: **Personas 5, 6** — accommodated by the same data model but minimal surface.
Future (Phase 3+): **Persona 7 (External Auditor)** — needs the auditor-role + sampling UI.

## 5. Regulatory & compliance scope

### 5.1 Frameworks the product must support evidentially

| Framework | Region | What the product must demonstrate |
|---|---|---|
| **ISO 45001:2018** | Global | Clauses 4 (context) → 10 (improvement): documented policy, hazard identification, legal-compliance register, objectives + KPIs, competence records, operational controls, emergency preparedness, incident investigation, internal audit, management review, CAPA, continual improvement |
| **OSHA 29 CFR 1904 / 1910** | US | OSHA 300 / 300A / 301 forms; chemical hazcom; LOTO 1910.147; PRCS 1910.146; PPE 1910.132; injury record retention 5 years |
| **IS 2190 (Indian Standard, fire extinguishers)** | India | Refill cycles, HPT (hydrostatic pressure test) intervals per extinguisher type — already encoded in `EmergencyEquipment.jsx#FIRE_EXT_TYPES` |
| **IS 14489 (Indian audit standard)** | India | Audit programme + audit findings + audit report structure |
| **Factories Act 1948 + State rules** | India | Form 30 (incident notification), Form 35 (medical exam records), Section 11–20 safety provisions |
| **EU OSH Framework Directive 89/391** | EU | Risk assessment, worker consultation, training records, health surveillance |
| **GDPR (data subject)** | EU + serving EU residents | Right to export, right to erase, breach notification 72h, lawful basis logging |
| **SOC 2 Type II** | Enterprise customers | Trust services: security, availability, confidentiality, processing integrity, privacy — needs audit trail + access reviews + change mgmt + incident response runbook |
| **ISO 27001** | Enterprise customers, public sector | ISMS controls — most overlap with SOC 2; adds risk treatment plan |
| **HIPAA** *(future, healthcare vertical)* | US healthcare | Health-data isolation (already partially supported by `canAccessHealth` flag); minimum-necessary access; BAA |

### 5.2 Compliance evidence requirements (cross-cutting)

| Requirement | Implementation status |
|---|---|
| Immutable audit log (write-once, no edit/delete) | **Partial** — `activityLog` and `accessAuditLogs` collections exist but rules don't yet pin `actorUid === auth.uid`. Phase 1 Blocker 2 fixes this. |
| Record retention (1y SOC 2, 3y ISO 27001, 5y OSHA) | **Manual** — no automatic enforcement. Phase 3 adds retention scheduler. |
| Right to export / erase user data | **Not yet** — Phase 1 Section 7 / B.12 will add `/api/admin/users/export` + `/erase` endpoints |
| Breach-notification workflow | **Runbook only** — Phase 1 Section 7 / B.13 adds `docs/incident-response.md` |
| Access reviews quarterly | **Not yet** — Phase 3 adds an admin review screen |
| Change management trail | **Partial** — Git history + PR template (committed). CHANGELOG.md auto-generation in Phase 3. |
| Encryption at rest / in transit | **Yes** — Firebase RTDB + Storage encrypt at rest; TLS 1.3 in transit |
| MFA for privileged roles | **Not yet** — Phase 1 Section 7 / B.2 adds TOTP for Global Owner + Site Owner |

## 6. Multi-tenancy model

### 6.1 Tenancy variants supported

| Variant | When to use | Status |
|---|---|---|
| **Shared Firebase project, path isolation** | Mid-market, low data-sensitivity, fast onboarding (default) | ✅ Today |
| **Per-org Firebase project** | Enterprise customers requiring data sovereignty, distinct billing, distinct App Check site keys | ✅ Today via `/setup` wizard writing per-org config to `localStorage` |
| **Self-hosted Firebase + self-deployed SPA** | Government / classified / on-prem | ⚠️ Possible (Firebase is hostable on private GCP); not currently documented |
| **Per-region multi-region deployment** | Large enterprises spanning continents | 🔜 Phase 3 — RTDB has regional URLs; SPA already detects via `databaseURL` |

### 6.2 Data isolation guarantees

- All organisation data lives under the path `organizations/{orgId}/` in RTDB
- All Storage objects live under `gs://<bucket>/organizations/{orgId}/`
- RTDB rules enforce that an authenticated user can ONLY read/write their own org's path (via `userDirectory/{uid}/orgId` mapping)
- A user's `status` must be `Active` for any read/write to succeed
- Public surfaces (`publicOrgDirectory`, `publicQrEnabled` records) are explicitly scoped and validated
- Phase 1 Blocker 3 adds: Storage rules use Firebase Auth **custom claims** (`orgId`, `role`, `status`) for the same scoping, since Storage rules can't query RTDB
- Phase 1 Blocker 1 adds: `controlPlane/orgs/{orgId}/serviceAccount` (server-only RTDB path) so per-org Admin SDK access is multi-tenant-aware

## 7. Roles, permissions & access model (RBAC)

### 7.1 Three roles

| Role | Scope | What they can do |
|---|---|---|
| **Global Owner** | Org-wide, all sites, all modules | Full access: read/write every record, manage users, manage sites, configure org settings, view audit logs |
| **Site Owner** | Single site (`assignedSite`) + optional `accessibleSitesMap` of additional sites | All modules scoped to their site(s); can manage users at their site(s); cannot edit Global Owner accounts |
| **User** | Site-scoped + only the modules explicitly listed in `accessibleModules` | Read/write only the modules they've been granted access to, scoped to their site |

### 7.2 Special access flags (additive on top of role)

| Flag | Purpose | Default |
|---|---|---|
| `canAccessHealth` | Read health-data collections (healthCases, healthSurveillance, vaccinationRecords, illnessRecords) | `false` — Global Owners always have access; others must be explicitly granted |
| `portalLinkedContractorId` | Vendor portal user linked to their contractor company record | `null` for non-vendor users |
| *(future)* `auditorReadOnly` | External auditor with read-only access across all modules for the duration of a cert audit | Planned Phase 3 |
| *(future)* `canManageSettings` | Site-level admin without full Global Owner privileges | Planned Phase 4 |

### 7.3 Site model

- Sites are identified by `siteId` (short code, e.g. `MUM-PLANT-01`)
- Sites have an optional list of **Centers** (sub-locations within a site)
- The string `'GLOBAL'` is a reserved siteId meaning "not site-scoped"
- A Site Owner's `assignedSite` can be `'GLOBAL'` to grant org-wide access without bumping to Global Owner

## 8. Functional requirements by module

Each section lists: purpose, primary user, key entities, must-haves, nice-to-haves, compliance mapping. **Modules marked ✅ exist today; 🟡 partial; 🔜 planned.**

### 8.1 Incidents ✅
**Purpose**: Record, classify, investigate, and close out all workplace incidents (injury, near-miss, property damage, environmental, security).
**Primary user**: Site Safety Officer (reporter), HSE Manager (investigator/closer)
**Entities**: `incidents/{id}` with fields: id, siteId, dateTime, severity (FAC/MTC/RWC/LTI/Fatal/Property/Env), category, description, immediateActions, root-cause (5-Why / Fishbone), evidence (photos/videos), CAPA links, status (Open / Under Investigation / Pending Approval / Closed), `closedAt`, `closedBy`
**Must-have**:
- 5-Why and Fishbone investigation tools
- AI-assisted root-cause + recommendations (✅ via `api/v1.js` / `server/incident-ai/`)
- Auto-link to contractor records when a contractor worker is involved
- Severity → automatic OSHA 300 classification
- Notify by email / push when incident is logged or escalated
- Mandatory 24h initial-report SLA tracking; 14-day root-cause-complete SLA
**Compliance**: ISO 45001 clauses 10.2, OSHA 300/301, Factories Act Form 30

### 8.2 Risk Assessments (HIRA) ✅
**Purpose**: Hazard Identification, Risk Assessment, and Control determination per task / process / chemical / activity.
**Primary user**: Site Safety Officer, with worker consultation
**Entities**: `riskAssessments/{id}` with fields: siteId, activity, hazards[], existingControls, residualRisk (Likelihood × Severity matrix, 5x5 standard), additionalControls, residualAfterControls, reviewer, reviewDate, validUntil
**Must-have**:
- 5x5 risk matrix with configurable thresholds
- Linked CAPAs for unacceptable residuals
- Periodic review reminders (annual, or post-incident, or post-change)
- Worker-consultation evidence (sign-off list)
**Compliance**: ISO 45001 clauses 6.1.2, EU OSH Directive Art. 9, Factories Act Sec. 41B

### 8.3 Audit (Plans + Findings) ✅
**Purpose**: Schedule, execute, and follow up on internal HSE audits (process, system, behaviour-based).
**Entities**:
- `auditPlans/{id}` — scope, scheduledDate, auditor, auditee, checklist template
- `auditFindings/{id}` — auditPlanId, observation, severity (Major / Minor / Observation / OFI), clauseRef, evidence, status, CAPA link
**Must-have**:
- Pre-loaded ISO 45001 + ISO 14001 + ISO 9001 checklists
- Layered audit support (operator → supervisor → manager cascade)
- Auto-generate auditor report PDF
**Compliance**: ISO 45001 clause 9.2, IS 14489

### 8.4 CAPA (Corrective & Preventive Actions) ✅
**Purpose**: Track every action raised from any source (incident, audit, inspection, observation, management review) through to verified closure.
**Entities**: `capa/{id}` with fields: source (incident/audit/inspection/etc.), sourceId, type (Corrective/Preventive), description, assignee, dueDate, status, evidence, verifiedBy, verifiedAt
**Must-have**:
- Cross-module link source → CAPA → effectiveness verification
- SLA tracking with reminder cascade (assignee → assignee's manager → Site Owner → Global Owner)
- Closure requires evidence (file upload or photo)
- Effectiveness review N days after closure
**Compliance**: ISO 45001 clause 10.2, OSHA recordkeeping

### 8.5 Permit-to-Work (PTW) ✅
**Purpose**: Issue, sign, and close work permits for hot work, confined-space, working-at-height, electrical, excavation, energy-isolation.
**Entities**: `ptwRecords/{id}` — permitType, location, validFrom/Until, issuedBy, issuedTo, contractorId, workScope, hazards, precautions, monitoring, signatures (multi-party), gas-test readings, status
**Must-have**:
- QR code per permit for on-site verification (✅ `publicQrEnabled` flag)
- Multi-signature workflow (issuer + receiver + safety officer + area authority)
- Auto-expiry + auto-cancellation
- Tie-in to LOTO (a hot work permit on a pump needs the LOTO procedure ID)
- Field-Portal sign-on flow for contractors
**Compliance**: ISO 45001 clause 8.1.1, OSHA hot-work standard, IS standards

### 8.6 LOTO (Lockout/Tagout) ✅
**Purpose**: Document and track hazardous-energy isolation procedures.
**Entities**:
- `lotoProcedures/{id}` — equipmentId, energySources[], isolation steps, verification, restoration steps
- `lotoLogs/{id}` — procedureId, performedBy, lockNumber, appliedAt, removedAt, signatures
**Must-have**:
- Multi-energy-source support (electrical, hydraulic, pneumatic, thermal, gravitational, chemical, residual)
- QR-tagged padlocks scannable from field-portal
- Group LOTO support (multiple workers, one isolation)
**Compliance**: OSHA 1910.147, ISO 45001 clause 8.1.1

### 8.7 Emergency Equipment ✅
**Purpose**: Inventory + inspection scheduling for emergency response equipment (fire extinguishers, first-aid, AED, eye-wash, spill kits, evacuation chairs).
**Entities**: `emergencyEquipment/{id}` — type, location (siteId + centerCode), assetSerialId, status, lastInspection, nextInspection, FE-specific (extinguisherType, lastRefill, lastHPT), FA-specific (contents-expiry), AED-specific (battery + electrode expiry)
**Must-have**:
- Per-type inspection cadence (FE monthly, AED quarterly, etc.)
- QR-tag per asset, scan to inspect (✅ public QR flow)
- IS 2190 refill + HPT cycle calculation (✅ encoded)
- Auto-generated daily inspection list per site
- Out-of-service + missing flags surface in reminders
**Compliance**: ISO 45001 clause 8.2, IS 2190, OSHA emergency-equipment standards

### 8.8 Inspections (Templates + Records) ✅
**Purpose**: Configurable safety inspection programme — scaffolding, electrical, height-safety, housekeeping, work-platform, lifting equipment, etc.
**Entities**:
- `inspectionTemplates/{id}` — name, frequency, questions[] (with weight, photo-evidence requirement, conditional follow-ups)
- `inspectionRecords/{id}` — templateId, siteId, performedBy, date, answers[], score, findings → CAPA links
**Must-have**:
- Drag-drop template builder; clone-and-customise
- Photo evidence per question (optional/required)
- Score calculation + threshold-based pass/fail
- Mobile-first execution flow (Field Portal)
**Compliance**: ISO 45001 clause 9.1

### 8.9 Training & Competency ✅
**Purpose**: Plan, deliver, record, and verify training (induction, refresher, role-based, regulatory, contractor-induction).
**Entities**: `trainings/{id}` — courseName, attendees[], trainer, date, durationHours, validUntil, certificateUpload, score
**Must-have**:
- Competency matrix per role (which trainings are mandatory for each role)
- Expiry alerts 30 days before validUntil
- Bulk attendance upload via Excel template
- External certificate upload + verification
- Contractor-worker training records (separate from employee training)
**Compliance**: ISO 45001 clause 7.2, OSHA training requirements per standard, Factories Act Sec. 11

### 8.10 Contractors ✅
**Purpose**: Manage contractor companies, their workers, and their compliance documents (insurance, registration, safety policy, worker medical).
**Entities**:
- `contractors/{id}` — companyName, gst/taxId, contact, documents[], status (Active / Suspended / Blacklisted), expiryDates per doc
- `contractors/{id}/workers/{workerId}` — name, role, medicalDocExpiry, trainingDocExpiry, photo, status
**Must-have**:
- Document expiry reminder (30/60/90 days)
- Blacklist propagation (a worker blacklisted at one site is flagged across the org)
- Vendor Portal self-serve for contractors to upload + maintain their own docs
- Tie-in to PTW + Incidents (cross-link by contractorId)
**Compliance**: Contractor Labour Act, ISO 45001 clause 8.1.4

### 8.11 Vendor Portal ✅
**Purpose**: Self-serve surface for contractor admins to manage their company + worker compliance.
**Primary user**: Contractor Administrator (Persona 4)
**Authentication**: Separate auth flow (`vendorPortalUsers/{uid}`), linked to a contractor via `portalLinkedContractorId`
**Must-have**:
- Upload company docs, see expiry status
- Add/remove workers, upload worker creds
- See list of active PTWs assigned to their workers
- Receive incident notifications involving their workers
- Read-only access to safety alerts published to vendors

### 8.12 Field Portal (Field App) ✅
**Purpose**: Mobile-first surface for field workers and contractor workers — minimal authentication, fast hazard reporting, permit signing, equipment lookup.
**Primary user**: Field Worker (Persona 3), Contractor Worker (Persona 5)
**Authentication**: QR-code based + session token (`FIELD_PORTAL_SESSION_KEY`)
**Must-have**:
- Report hazard / near-miss in 3 taps (location auto-set from QR + photo + description)
- Scan QR on equipment to see inspection history + record a new inspection
- Sign a PTW issued to them
- View today's tasks (PTWs awaiting sign-off, inspections due)
- Offline-tolerant (Phase 2): queue submissions, sync when online
- Works in PPE gloves (large tap targets, no fine-text inputs)

### 8.13 Mock Drill ✅
**Purpose**: Plan and document emergency-response drills (fire evacuation, chemical spill, medical, confined-space rescue, bomb threat).
**Entities**: `mockDrills/{id}` — scenario, date, siteId, participants, response time, observations, gaps → CAPA
**Must-have**:
- Pre-loaded scenarios with checklist of expected response steps
- Stopwatch + checkpoint timing
- After-action review template
- Frequency tracking (monthly / quarterly / annual per scenario type)
**Compliance**: ISO 45001 clause 8.2, OSHA emergency-action-plan standards

### 8.14 Health (Occupational Health) ✅
**Purpose**: Track worker health surveillance, vaccination, illness records, and clinical cases.
**Entities**: `healthCases`, `healthSurveillance`, `vaccinationRecords`, `illnessRecords` (all under `organizations/{orgId}/`)
**Access control**: Tightened in Phase 1 / Week 2 — Global Owner OR user with `canAccessHealth: true` flag, scoped by site
**Must-have**:
- Periodic medical examination scheduling (annual, role-based, hazard-based)
- Vaccination tracker (esp. for healthcare, food, hazmat workers)
- Occupational illness register (per Factories Act Sec. 89/90)
- Confidentiality controls (default deny; explicit `canAccessHealth` grant)
**Compliance**: ISO 45001 clause 8.1, Factories Act Sec. 89/90, EU OSH Directive Annex I, HIPAA (future)

### 8.15 Consultation ✅
**Purpose**: Document worker consultation + participation (safety committee meetings, worker representative input, suggestion box).
**Entities**: `consultations/{id}` — type, date, participants, agenda, decisions, actions → CAPA
**Compliance**: ISO 45001 clause 5.4, EU OSH Directive Art. 11

### 8.16 Improvement ✅
**Purpose**: Track safety improvement opportunities, observation-based suggestions, behaviour-based safety observations.
**Entities**: `improvements/{id}` — category (BBS / Observation / Suggestion / Kaizen), description, observer, observedBehaviour, intervention, status, CAPA links
**Compliance**: ISO 45001 clause 10.3

### 8.17 Standards ✅
**Purpose**: Internal library of safety standards, work procedures, SOPs, JSAs (Job Safety Analyses).
**Must-have**: Document versioning, acknowledgement tracking (which workers have read which SOPs)

### 8.18 Sites (& Centers) ✅
**Purpose**: Manage the organisation's site hierarchy.
**Entities**: `sites/{siteId}` — name, code, address, region, centers[] (subordinate locations)
**Must-have**:
- Global Owner-only write access
- Site + Center used by every other module's scoping
- Region grouping for cross-region reports

### 8.19 Users ✅
**Purpose**: Manage organisation members — provisioning, role assignment, site assignment, module access, status.
**Entities**: `users/{uid}`, `userDirectory/{uid}` (cross-org lookup), `userPasswordState/{uid}` (mustChangePassword, temporary-pw flags)
**Must-have**:
- Server-side provisioning (Phase 1 Blocker 1)
- Role + site assignment UI
- Module access checkboxes (for `User` role)
- Bulk import via Excel
- Self-serve "must change password" flow
- Activity audit (who edited whom, when)

### 8.20 Activity Calendar ✅
**Purpose**: Cross-module calendar view of scheduled audits, inspections, training, mock drills, PTW validity windows.

### 8.21 Analytics & Reporting ✅
**Purpose**: Trend dashboards, leading + lagging indicators, exportable reports.
**Must-have KPIs**: LTIFR, TRIFR, severity rate, CAPA closure rate, PTW compliance, inspection completion rate, training compliance, mock-drill frequency, contractor incident rate, near-miss-to-incident ratio
**Must-have visualisations**: Time-series, per-site comparison, severity heatmap, top-10 hazard categories, CAPA aging
**Export**: PDF (auditor-ready) + Excel (raw data) + CSV (machine-readable)

### 8.22 OHS Tools ✅
**Purpose**: Calculators and reference tools — chemical exposure limit lookup, noise dose calculator, heat-stress index, fall-arrest force calculator, etc. Lightweight, no persistence.

### 8.23 Dashboard ✅
**Purpose**: Single overview page — "what needs me today" reminder feed + per-module summaries + site selector for global users.
**Must-have**: Reminder feed already implemented (`useReminders` + `NeedsAttentionPanel`)

### 8.24 Tutorials ✅
**Purpose**: In-app video guides + module walk-throughs. Per-module modal triggered on first visit (`ohsms:tutorial-seen:{id}` localStorage key).

### 8.25 Workspaces Management ✅
**Purpose**: Multi-org workspace switcher — for consultants / auditors who serve multiple organisations from the same browser.

### 8.26 Database Setup ✅
**Purpose**: One-time configuration wizard at `/setup` — points the SPA at a Firebase project + writes RTDB rules + seeds the first Global Owner.

### 8.27 Fire Marshal "Sam" assistant ✅
**Purpose**: Always-available, page-context-aware safety guide. Answers "what does this module do?" / "what's overdue?" / "what should I do next?" — rule-based today, AI-backed in Phase 3.

## 9. AI capabilities

### 9.1 Incident AI Investigation (current)
- **Endpoint**: `POST /api/v1/incidents/{id}/...` (Vercel serverless function `api/v1.js`, with worker code under `server/incident-ai/`)
- **Storage**: Vercel Blob for evidence binaries, Firebase RTDB for durable job state
- **LLM**: OpenAI (`OPENAI_API_KEY` env var) — analyses uploaded photos/videos + narrative, suggests root causes, recommends CAPAs
- **Trigger**: Manual ("Smart Investigate" button on incident detail) — never automatic, evidence is sensitive
- **Output**: Structured suggestion attached to the incident; reviewer accepts/rejects each recommendation

### 9.2 Sam assistant (current)
- Rule-based answer engine over `utils/fireMarshalAssistant.js` + live module context (`useFireMarshalRegister`)
- Knows per-page guides and suggested questions for ~15 modules

### 9.3 Future AI capabilities (Phase 3+)
- **Auto-classify hazards from photos** (vision model on Field Portal hazard reports)
- **CAPA recommendation** based on similar past incidents in the org
- **Inspection question generation** from uploaded SOP PDFs
- **Audit-finding clustering** ("you have 12 similar findings across 4 audits — root cause?")
- **Sam → LLM-backed** for free-form Q&A grounded in the org's own data

## 10. Reporting & analytics

### 10.1 Built-in reports
- ISO 45001 management-review pack (annual)
- OSHA 300A summary (annual, US sites)
- Form 30 / Form 35 (Indian sites)
- Per-site monthly safety report
- Contractor performance scorecard
- Training compliance matrix
- CAPA aging report

### 10.2 Custom reports
- Filter-based report builder over any module
- Saved-report library per org
- Scheduled email delivery (Phase 2)

### 10.3 KPI dashboard
- Configurable widget set per role
- Trend lines: 12-month rolling
- Comparison: site-to-site, period-to-period, internal-vs-contractor

## 11. Cross-cutting non-functional requirements

### 11.1 Security (see also Section 5 + the Phase 1 plan)
- Firebase App Check enforced on all client → backend calls
- TLS 1.3 only; HSTS 2y with `preload`
- CSP enforced (not Report-Only)
- MFA (TOTP) for Global Owner + Site Owner (Phase 1 / Week 6)
- Password policy: ≥12 chars, complexity, breach-check via HIBP
- Session: 12h absolute lifetime, 15min idle for privileged roles
- Refresh-token revocation on role change / status → Inactive
- Audit log immutable, write-once, `actorUid` pinned to `auth.uid`
- All attachments scanned for content-type + size cap + sha256

### 11.2 Privacy
- GDPR data export endpoint per user (Phase 1 / Week 6)
- GDPR erasure endpoint per user (with legal-hold check)
- Health data isolated (`canAccessHealth` flag)
- Per-org data isolation enforced by rules

### 11.3 Availability
- Target: 99.9% monthly (≤ 43 minutes downtime / month)
- Firebase RTDB: 99.95% SLA (Spark/Blaze)
- Vercel functions: 99.99% per region
- Graceful degradation: REST adapter falls back to SDK when REST blocked (Phase 1)
- Offline-tolerant for Field Portal (Phase 2)

### 11.4 Performance
- Dashboard time-to-interactive: <3s on 4G
- Module page TTI: <2s
- Incident submission: <5s end-to-end including evidence upload
- Report generation: <10s for monthly per-site report

### 11.5 Accessibility
- WCAG 2.1 AA compliance for all primary surfaces
- Screen-reader support
- Keyboard navigation
- Reduced-motion respect (already implemented in `AppExperienceShell`)
- Field Portal: large tap targets (≥44×44px), high contrast, no fine text

### 11.6 Internationalisation (Phase 3)
- All UI strings extractable
- Date/time/number formatting per locale
- Target languages: EN (default), HI, ES, AR, ZH-CN
- RTL layout support

### 11.7 Mobile / responsive
- All modules responsive down to 320px width
- Field Portal: PWA installable, touch-first
- Native app wrappers (Capacitor or React Native shell) — Phase 4

### 11.8 Scalability
- Per-org data size target: ≤10M records across all collections
- Per-org user count target: ≤10,000 active users
- Concurrent users per org: ≤500
- Attachments: ≤25MB per file, no per-org cap (Storage scales independently)
- For larger orgs, the per-org-Firebase-project model splits load

## 12. Architecture & technology stack

### 12.1 Stack (current)
- **Frontend**: React 19, Vite 8, Tailwind v4, framer-motion, three.js (Sam 3D avatar), Zustand (state), react-router-dom 7
- **Backend (BaaS)**: Firebase RTDB, Firebase Auth, Firebase Storage, Firebase App Check, Firebase Hosting
- **Serverless functions**: Vercel (`api/admin/users.js`, `api/v1.js`)
- **Auth**: Firebase Auth + ID tokens + (future) custom claims for cross-system identity
- **Build**: Two Vite SPAs — main app (`dist/`), field portal (`dist-field-portal/`)
- **CI/CD**: GitHub Actions (`.github/workflows/ci.yml`, `deploy-staging.yml`, `deploy-production.yml`, `pr-preview.yml`, `e2e-nightly.yml`, `codeql.yml`, `regen-and-deploy.yml`)
- **Testing**: Node `--test` for unit tests; Playwright for E2E
- **Type system**: JSDoc + ESLint (no TypeScript today; planned for Phase 4)

### 12.2 Adapter pattern
- All DB calls go through `src/services/db/index.js` (firebase or rest adapter selected at module-load time)
- All auth calls go through `src/services/auth/index.js`
- This lets us swap backends per-org without touching component code

### 12.3 Multi-tenant architecture diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  SPA bundle (placeholder Firebase config baked at build time)   │
│  Hosted on Firebase Hosting (app, fieldportal targets) — shared │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼ user visits /login or /setup
┌─────────────────────────────────────────────────────────────────┐
│  /setup wizard writes org-specific config to                    │
│  localStorage('ohsms_firebase_config')                          │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼ next page load
┌─────────────────────────────────────────────────────────────────┐
│  src/config/firebase.js reads localStorage first, falls back to │
│  build-time env vars, finally to PLACEHOLDER_FIREBASE_CONFIG    │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────────────┐
│  Firebase RTDB / Auth / Storage / App Check                     │
│  — per-org project, isolated billing, isolated data            │
└─────────────────────────────────────────────────────────────────┘
              │
              ▼ admin operations (user create/delete, claim refresh)
┌─────────────────────────────────────────────────────────────────┐
│  Vercel serverless: api/admin/users.js                          │
│  Uses api/admin/_lib/firebase-admin.js to resolve per-org       │
│  Admin SDK from controlPlane/orgs/{orgId}/serviceAccount        │
│  (control-plane project) or default env-var SA                  │
└─────────────────────────────────────────────────────────────────┘
```

## 13. Data model (top-level entities)

```
publicOrgDirectory/{orgId}        — org name + dbAdapter (org picker)
publicOrgDirectoryTombstones/{orgId}  — soft-deleted orgs
joinRegistry/{joinCode}            — joinCode → orgId mapping
controlPlane/orgs/{orgId}          — server-side per-org SA (server-only)
userDirectory/{uid}                — uid → orgId mapping (lookup)
organizations/{orgId}/
    details/                       — org settings (name, owner, branding)
    sites/{siteId}                 — site list
    users/{uid}                    — user records (role, assignedSite, etc.)
    userPasswordState/{uid}        — must-change-password tracking
    permissionRequests/{id}        — pending access requests
    accessAuditLogs/{id}           — user-mgmt audit (Phase 1: merged into auditLogs)
    activityLog/{id}               — module write log (Phase 1: merged)
    auditLogs/{id} 🔜               — unified immutable audit log (Phase 1 Blocker 2)
    incidents/{id}
    riskAssessments/{id}
    consultations/{id}
    auditPlans/{id}
    auditFindings/{id}
    improvements/{id}
    ptwRecords/{id}
    lotoProcedures/{id}
    lotoLogs/{id}
    mockDrills/{id}
    emergencyEquipment/{id}
    inspectionTemplates/{id}
    inspectionRecords/{id}
    trainings/{id}
    manHours/{id}
    contractors/{id}/
        workers/{workerId}
        documents/{docId}
    vendorPortalUsers/{uid}
    healthCases/{id}
    healthSurveillance/{id}
    vaccinationRecords/{id}
    illnessRecords/{id}
    documents/{id}
```

## 14. Integrations

### 14.1 Today
- **Email**: EmailJS (`api.emailjs.com` — used for invitations, vendor notifications, report delivery)
- **OpenAI**: Incident AI investigation backend
- **Vercel Blob**: Evidence binary storage (incident AI flow)
- **QR codes**: `qrcode.react` + `html5-qrcode` for issue + scan
- **Excel**: `exceljs` for import/export

### 14.2 Planned
- **SSO**: SAML 2.0 + OIDC for enterprise customers (Phase 3)
- **SCIM 2.0**: User provisioning from Azure AD / Okta (Phase 4)
- **HR systems**: Workday, SAP SuccessFactors connectors (Phase 4)
- **ERP**: SAP / Oracle for asset-master sync (Phase 4)
- **Webhook outbox**: Event-driven integration surface (Phase 3)
- **Microsoft Teams + Slack**: Notification adapters (Phase 3)
- **Power BI / Tableau**: Read-only data warehouse export (Phase 4)

## 15. Security & audit requirements

(See Section 11.1 + the dedicated Phase 1 plan in `docs/phase1-enterprise-readiness-plan.md`.)

### 15.1 Audit log requirements
- Every write to organisation data produces an audit entry
- Entry fields: `timestamp`, `actorUid`, `actorEmail`, `actorRole`, `orgId`, `collection`, `recordId`, `action` (create/update/delete), `category` (user-mgmt / module-data / permission / attachment / config), `beforeHash`, `afterHash`, `beforeDiff`, `afterDiff`, `source` (client/server), `ipAddress` (server-side only), `userAgent` (server-side only)
- Rules pin `actorUid === auth.uid` for client writes (no forgery)
- Server-written entries (`source === 'server'`) bypass via Admin SDK — these are the only entries where actor ≠ uid (e.g., system-initiated)
- Write-once: no client `.write` rule for update or delete
- Retention: 2 years hot in RTDB, then cold-storage export (Phase 2)

### 15.2 Attachment requirements
- All attachments stored in Firebase Storage (NOT base64 in RTDB) — Phase 1 Blocker 3
- Storage rules require: org membership (via custom claims), content-type allowlist, ≤25MB
- Delete is server-only (via `api/admin/storage-delete.js`)
- Every upload + delete writes an audit log entry

## 16. Deployment & DevOps

### 16.1 Environments
| Environment | Purpose | URL pattern |
|---|---|---|
| Local dev | `npm run dev` per engineer | `http://localhost:5173` |
| PR preview | Per-PR Firebase Hosting channel | `<site>--pr-<number>-<hash>.web.app` |
| Staging | Continuous deploy from `main-3dbme3` branch | Hosting channel `staging` on the SPA-host project |
| Production | Tag-based deploy `v*.*.*` | Hosting `live` channel |

### 16.2 CI/CD checks (every PR)
- Lint (ESLint)
- Unit tests (Node `--test`)
- RTDB rules validation (`tests/database-rules.test.mjs`)
- Build (both SPAs — matrix)
- `npm audit --audit-level=high --omit=dev`
- Gitleaks secret scan
- CodeQL JS/TS analysis

### 16.3 Required GitHub config (manual one-time)
- Variables: `FIREBASE_PROJECT_ID`
- Secrets (env: staging): `FIREBASE_SERVICE_ACCOUNT_JSON_STAGING`
- Secrets (env: production): `FIREBASE_SERVICE_ACCOUNT_JSON_PRODUCTION`
- Branch protection on `main` and `main-3dbme3`: required checks, signed commits, linear history, code-owner review on rules/CI/auth/db paths

### 16.4 Onboarding a new tenant (target: ≤30 min)
1. Customer creates their own Firebase project (or we create one for them)
2. Operator generates service-account JSON for the new project
3. Operator writes the SA JSON to `controlPlane/orgs/{newOrgId}/serviceAccount` (server-only RTDB path)
4. Customer visits SPA `/setup`, enters the Firebase project's web config
5. SPA writes config to `localStorage`, reloads against the new project
6. Customer creates first Global Owner account; SPA seeds RTDB rules
7. Done — customer can invite their team, configure sites, start using

## 17. Roadmap

### Phase 1 — Enterprise readiness (in progress, ~7–8 weeks for 2 engineers)
- ✅ CI/CD pipeline (lint, build matrix, deploy staging, deploy production, PR previews, CodeQL, secret scan)
- ✅ Security baseline (App Check enforcement scaffolded, CSP hardened, RTDB rules tightened, health-data flag)
- 🟡 Blocker 1: Server-side user provisioning + per-org Admin SDK + custom claims (foundation done)
- 🔜 Blocker 2: Immutable audit-trail logging
- 🔜 Blocker 3: Attachments → Firebase Storage migration
- 🔜 Security hardening tier 2: MFA, password policy, session, Storage rules, rate limiting, GDPR endpoints, incident runbook

### Phase 2 — Field + offline + audit-ready (3 months after Phase 1)
- Field Portal offline mode with sync queue
- Audit-log review UI for Global Owners
- Auditor read-only role + audit-bundle export
- Scheduled email reports
- Webhook outbox
- Document versioning + acknowledgement tracking
- Per-tenant retention policy enforcement

### Phase 3 — AI + integrations (4 months after Phase 2)
- SSO (SAML 2.0 + OIDC)
- Microsoft Teams + Slack notifications
- AI: Hazard classification from photos, CAPA recommendation, Sam → LLM
- Internationalisation (HI, ES, AR, ZH-CN)
- Multi-region RTDB support
- Native mobile apps (Capacitor)

### Phase 4 — Enterprise platform (6+ months after Phase 3)
- SCIM 2.0 provisioning
- HR + ERP connectors (Workday, SAP)
- Power BI / Tableau export
- TypeScript migration
- HIPAA compliance (healthcare vertical)
- White-label / OEM offering

## 18. Success metrics & KPIs

### 18.1 Adoption (per org)
- Time-to-first-incident-logged: <24h post-onboarding (target)
- Active users / total provisioned users: >80%
- Modules-used / modules-licensed: >60%
- Field Portal MAU: >50% of field workers
- Vendor Portal MAU: >80% of active contractor companies

### 18.2 Engagement
- Reminders cleared / reminders raised per week: >70%
- CAPA closure rate on-time: >75%
- Inspection completion rate vs scheduled: >90%
- Mock drill frequency adherence: 100%

### 18.3 Business
- Net Revenue Retention: >120%
- Logo retention (annual): >95%
- ARR per customer: $25k median (mid-market), $250k+ (enterprise)
- Gross margin: >80%
- Time-to-onboard new customer: <30 days from signed contract

### 18.4 Quality & compliance
- Audit-trail completeness: 100% of writes logged
- External audit-finding rate against the system: 0 critical, ≤2 minor / year
- Zero data-isolation breaches between tenants
- Security incidents (CVSS ≥7): 0
- GDPR data-subject request fulfilment: <30 days, 100%

## 19. Risks & open questions

### 19.1 Product risks
| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Customers refuse multi-tenant; demand on-prem | Medium | High | Document the per-org Firebase project model + self-host runbook |
| Field Portal adoption stalls without offline | High | High | Phase 2 priority; PWA + sync queue |
| AI features regress under privacy review | Medium | Medium | Per-org opt-in; no cross-org training; explicit consent UI |
| Indian Factories Act compliance details drift across states | High | Medium | Configurable per-state ruleset; partner with local consultancy for state coverage |
| External auditor refuses to use the system | Medium | Medium | Phase 2 auditor-read-only role + traditional PDF export as fallback |

### 19.2 Technical risks
| Risk | Mitigation |
|---|---|
| RTDB cost balloons with large attachment-heavy orgs | Phase 1 Blocker 3 moves attachments to Storage |
| Vercel function cold-start latency on admin endpoints | Vercel Edge runtime evaluation; minimum-instance config on paid tier |
| Firebase RTDB regional limits | Per-tenant project model can pick the right region; document constraint |
| Audit-log table grows unbounded | 2-year hot retention + cold-storage export script (Phase 2) |
| Sam assistant 3D bundle inflates initial load | Already lazy-loaded; 2D SVG fallback works without three.js |

### 19.3 Open product questions
1. Pricing model — per-user, per-site, per-module, or tiered? (Recommendation: tier by user count + site count, modules unbundled in Enterprise)
2. Should we offer a no-charge "Starter" tier for ≤25 users? (Demand-gen tradeoff vs support cost)
3. Do we build an in-product marketplace for industry-specific templates (chemical-plant inspection checklists, construction PTW templates)?
4. Is `canAccessHealth` granular enough or should we add `canEditHealth` + `canReadHealth` separately?
5. Vendor Portal: do contractors pay for their own seats, or are they bundled into the host org's licence?
6. How aggressively do we deprecate `xlsx` (CVE'd dep) for `exceljs`?
7. Should the SPA bundle stay one big artifact or split per-module-bundle (better TTI but more complex caching)?

## 20. Glossary

| Term | Meaning |
|---|---|
| OHSMS | Occupational Health & Safety Management System |
| ISO 45001 | International standard for OHSMS (replaces OHSAS 18001) |
| CAPA | Corrective Action / Preventive Action |
| PTW | Permit-to-Work |
| LOTO | Lockout/Tagout |
| HIRA | Hazard Identification & Risk Assessment |
| LTIFR | Lost Time Injury Frequency Rate (per million hours worked) |
| TRIFR | Total Recordable Injury Frequency Rate |
| FAC / MTC / RWC / LTI | First-Aid Case / Medical Treatment Case / Restricted Work Case / Lost-Time Injury |
| JSA | Job Safety Analysis |
| SOP | Standard Operating Procedure |
| BBS | Behaviour-Based Safety |
| HSE | Health, Safety & Environment |
| FE / FA / AED | Fire Extinguisher / First Aid / Automated External Defibrillator |
| HPT | Hydrostatic Pressure Test (fire extinguisher cylinder recertification) |
| SCBA | Self-Contained Breathing Apparatus |
| RBAC | Role-Based Access Control |
| RTDB | Firebase Realtime Database |
| App Check | Firebase service that attests requests came from a registered app |
| SCIM | System for Cross-domain Identity Management |

---

## Appendix A — Decision log

Material product/architecture decisions and where they were made.

| Date | Decision | Why | Doc/PR |
|---|---|---|---|
| 2026-06 | Multi-tenant via per-org Firebase project (SPA ships placeholder config) | Data sovereignty + billing isolation per customer | This PRD §6, commit cb3723d |
| 2026-06 | Per-org SA registry for Admin SDK access (`controlPlane/orgs/*`) | Bridges single-Vercel-function with multi-tenant Firebase | This PRD §12.3, commits bb3646e + 0bed23b |
| 2026-06 | Health data requires explicit `canAccessHealth` flag | SOC 2 + HIPAA prep + principle of least privilege | This PRD §7.2, commit 6017fae |
| 2026-06 | CI/CD via Firebase Hosting preview channels (not Vercel previews) | Preview URLs auto-authorised on Firebase Auth domain | Phase 1 plan + workflows |
| 2026-06 | Audit log: client-wrapper + server-write for sensitive ops (not pure server-proxy) | Avoids latency hit on common writes while still attesting privileged ops | Phase 1 plan |

## Appendix B — Related documents

- `CLAUDE.md` — developer onboarding for the codebase
- `SECURITY_REVIEW.md` — current security posture (partial, being superseded by Phase 1)
- `README.md` — repo overview
- `FIELD_PORTAL_DEPLOYMENT.md` — Field Portal deploy specifics
- `VERCEL_DEPLOYMENT.md` — Vercel function deploy specifics
- `database.rules.json` — authoritative RTDB rules
- `storage.rules` — authoritative Storage rules
