# WA! Network Asia — Central Management System (CMS)
## Project Brief for Claude Code

---

## OVERVIEW

This is a production React + Firebase web application for **WA! Network Asia**, a main contractor managing CCTV installation projects in Singapore. The app replaces manual Excel/WhatsApp/PDF workflows with a centralised digital management system.

**Live URL:** `app.wanetwork.asia` — self-hosted on lab-1, served by Nginx
from `/opt/apps/wa-network-cms/build`, **on port 3001** (not 80/443).
The Cloudflare Tunnel's ingress rule maps `app.wanetwork.asia` directly to
`http://localhost:3001` — this is the real production path, confirmed via
the tunnel's own ingress config (`journalctl --user -u
cloudflared-wanetwork.service`), not an assumption from the nginx file
layout. **Do not change this port** without also updating the tunnel's
ingress rule on the Cloudflare dashboard, or the app will go dark even
though nginx looks fine locally. A leftover port-80 `server{}` block for
this app was removed 2026-08-11 after being misidentified as the "real"
path — port 80 was actually never in the tunnel's routing table for this
app, only nginx's own unrelated `default_server` placeholder answers on
80 now. See "Firewall/exposure audit" below for full context.
**Firebase Project:** `wa-network-cms`
**File storage:** migrated off Dropbox 2026-08-10 — see "Storage
migration" section below. Firestore/Auth remain on Firebase, deliberately
not migrated (see reasoning below).

---

## TECH STACK

| Layer | Technology |
|-------|-----------|
| Frontend | React (create-react-app), self-hosted build served by Nginx on lab-1 |
| Database | Firebase Firestore (unchanged, not self-hosted) |
| Authentication | Firebase Auth — Email/Password (unchanged, not self-hosted) |
| Hosting | Self-hosted (lab-1, Cloudflare Tunnel) at app.wanetwork.asia. Firebase Hosting (`wa-network-cms.web.app`/`.firebaseapp.com`) still exists but now just 301-redirects here — do not rely on it serving current content. |
| File Storage | Self-hosted on lab-1 disk (`/mnt/storage/wanetwork/`), served via Nginx `/files/` alias. Uploads go through a local upload API (port 9097) called from a Firebase Cloud Function. Dropbox is fully decommissioned as of 2026-08-10 (subscription may still be active — check before assuming it's cancelled). |
| Domain | Cloudflare (migrated off GoDaddy) — app.wanetwork.asia |

## Storage migration (2026-08-10) — read before touching upload/file code
Original design used Dropbox for all file storage, links stored in
Firestore. Migrated to self-hosted storage as part of the broader lab-1
cost-cutting effort (goal: eliminate recurring Dropbox subscription cost
across both businesses on this server).
- `functions/index.js`'s `uploadProjectDocument` Cloud Function now calls
  a local upload API (`https://app.wanetwork.asia/api/upload`, proxied by
  Nginx to `127.0.0.1:9097`) instead of the Dropbox API. Folder allowlist
  validation logic is unchanged. New Firebase secret: `SERVER_UPLOAD_SECRET`
  (replaces the old `DROPBOX_APP_KEY`/`DROPBOX_APP_SECRET`/
  `DROPBOX_REFRESH_TOKEN` secrets — those should be deleted from Firebase
  once confirmed unused).
- New service: `/opt/apps/wa-network-cms-upload-api/server.js` on lab-1,
  systemd unit `wa-network-cms-upload-api.service`, port 9097.
- Files stored under `/mnt/storage/wanetwork/`, served publicly at
  `/files/<relative-path>` via Nginx. **All file URLs are relative paths**
  (not baked-in absolute origins) — this was a deliberate design choice
  that turned out to make the app structurally resilient to the kind of
  stale-build bug that hit Astee (see below).
- `src/utils/docViewer.js` still contains legacy Dropbox `dl=`/`raw=1` URL
  param handling — harmless no-op now since no stored URLs contain
  "dropbox" anymore, but safe to remove in a future cleanup pass.
- Why Firestore/Auth stayed on Firebase: unlike Astee (which has its own
  Node/Express backend that could just be pointed at a new DB), this app
  talks to Firestore directly from the frontend with no backend
  abstraction layer — migrating off Firestore would mean rebuilding the
  entire data layer, which was explicitly out of scope for this round.
  Only "eliminate the Dropbox cost" was the stated goal.

## Split-brain bug audit (2026-08-10) — related to the Astee incident
After a data-loss bug was found and fixed in the sibling Astee app (a
stale PWA session kept writing to an abandoned old database because its
API URL was baked in at build time), this app was audited for the same
class of issue. Findings:
- Lower risk by design: relative file paths mean an open session
  automatically benefits from backend/origin changes, no build-time
  baked absolute URL to go stale.
- No service worker/asset caching (this app has none at all), so no
  caching-related staleness risk either.
- One real gap found and fixed: `wa-network-cms.web.app` (the raw
  Firebase Hosting URL) was still serving an old, different build,
  never redeployed after this app moved to self-hosting — anyone
  landing there directly would've hit broken `/files/` links. Fixed
  with a permanent 301 redirect in `firebase.json` to
  `https://app.wanetwork.asia`.
- Belt-and-suspenders fix also added: `src/utils/autoUpdate.js`, wired
  into `App.js`, polls `/asset-manifest.json` every 3 minutes and
  force-reloads on a build-hash change — same mechanism as Astee's fix,
  ported here even though the specific failure mode doesn't really apply
  to this app's architecture.

## Firewall/exposure audit (2026-08-11)
A UFW audit found `3001/tcp` open to "Anywhere" (the whole internet), not
just needed for the tunnel. Investigated assuming it was a redundant
leftover duplicate of a port-80 path — **this assumption was wrong**;
port 3001 is the actual production path (see Live URL note above).
What was actually fixed: the UFW rule allowing **direct external**
access to 3001 was removed (`sudo ufw delete allow 3001/tcp`) — this
closes the ability for anyone to hit the app directly over raw HTTP,
bypassing Cloudflare's protection, while leaving the tunnel itself
completely unaffected, since cloudflared reaches nginx over loopback
(127.0.0.1), which UFW's external-facing rules never governed. Lesson
for future audits: check the Cloudflare Tunnel's actual ingress config
(`journalctl --user -u <tunnel-service> | grep ingress`) before assuming
which port is "the real one" from file layout alone — the same mistake
was almost made here twice.

The same audit correctly identified and removed a genuinely redundant
duplicate in the sibling Astee app (a forgotten system-level backend on
port 8080, bypassing its own tunnel) — that one really was dead weight.
Not every "extra open port" is the same kind of finding; verify each one
against its tunnel's actual ingress rule individually.

## Current Status (as of 2026-08-10)
Storage migration and hardening considered complete. Owner has asked to
hold all further app work (features and infra cleanup alike, e.g.
deleting old Dropbox secrets / cancelling the subscription) for a few
days to let both this app and Astee run stable before resuming.

---

## FIREBASE CONFIG

```javascript
// Values stored in .env.local — see REACT_APP_FIREBASE_* variables
const firebaseConfig = {
  apiKey: process.env.REACT_APP_FIREBASE_API_KEY,
  authDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.REACT_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.REACT_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.REACT_APP_FIREBASE_APP_ID,
};
```

---

## AUTHENTICATION APPROACH

Users log in with **User ID + 4-digit PIN** (not email/password directly).

Behind the scenes:
- Firebase Auth email format: `USERID@wanetwork.cms` (e.g. `WA001@wanetwork.cms`)
- Password stored in Firebase Auth = the PIN
- PIN change = Firebase Auth password update
- First login flag stored in Firestore users collection
- Admin resets PIN by updating Firebase Auth password + setting firstLogin: true in Firestore

---

## ROLE HIERARCHY (6 roles)

| Role | Code | Description |
|------|------|-------------|
| Owner | `owner` | Full access to everything |
| Manager | `manager` | All except system settings |
| Supervisor | `supervisor` | Projects, HSE, attendance approval |
| Staff | `staff` | Own attendance, leave, block updates for own team |
| Sub-con Admin | `subcon-admin` | Manages own company workers, sees assigned projects |
| Sub-con | `subcon` | Sees assigned blocks and permitted documents only |

---

## INITIAL USERS

| User ID | Name | Role | PIN | First Login | Team | Parent |
|---------|------|------|-----|-------------|------|--------|
| WA001 | Andy Ng | owner | 1234 | false | none | - |
| WA002 | Manager | manager | 1111 | false | none | - |
| WA003 | Supervisor | supervisor | 2222 | false | none | - |
| WK001 | Worker 1 | staff | 3333 | true | own | - |
| WK002 | Worker 2 | staff | 3334 | true | own | - |
| WK003 | Worker 3 | staff | 3335 | true | own | - |
| WK004 | Worker 4 | staff | 3336 | true | own | - |
| WK005 | Worker 5 | staff | 3337 | true | own | - |
| KVM-ADM | KVM Admin | subcon-admin | 4444 | true | kvm | - |
| SR-ADM | Sree Ram Admin | subcon-admin | 5555 | true | sree | - |
| HB-ADM | Habibur | subcon-admin | 6666 | true | habibur | - |
| AL-ADM | Alamin Admin | subcon-admin | 7777 | true | alamin | - |
| KVM-01 | KVM Worker 1 | subcon | 4401 | true | kvm | KVM-ADM |
| SR-01 | SR Worker 1 | subcon | 5501 | true | sree | SR-ADM |

---

## BUSINESS CONTEXT

**Company:** WA! Network Asia (main contractor)  
**Director:** Andy Ng (WA001)

**Current project:** PCS Batch 3 — CCTV installation for Certis Technology (S) Pte Ltd (contracted under SPF)  
- 175 HDB blocks in Woodlands area  
- 5 directly employed workers  
- 4 sub-contractor teams: KVM, Sree Ram, Habibur, Alamin (trading as Seabiz)

**Certis claim rates (PCS Batch 3):**
- Stage 1 (fix1 + fix2 done): $1,500/block
- Stage 2 (fix3 + fix4 done): $3,000/block minus materials
- Stage 3 (decommission): $1,000/block

**Sub-con rates:** ~10% less than Certis rates (configurable per team per stage)

**Installation stages:**
- fix1 = Conduit installation
- fix2 = CAT6 cable pulling
- fix3 = Server rack installation
- fix4 = Camera installation

**Daily WhatsApp report format:**
```
BlockNo | fix1-X% fix2-X% fix3-X% fix4-X% | camN(O/I)
```
O = outdoor rack, I = indoor rack

---

## DESIGN SYSTEM

```css
--red: #CC0000
--red-dark: #a00000
--red-light: #fff0f0
--navy: #1a1a2e
--navy-mid: #16213e
--surface: #f5f6f8
--card: #ffffff
--border: #e2e6ed
--text: #1a2233
--text-sec: #5a6577
--green: #1a8a5a
--green-bg: #e8f7f1
--amber: #d97b00
--amber-bg: #fff7e6
--blue: #1a5fa8
--blue-bg: #e8f0fb
--purple: #6d3fa8
--purple-bg: #f0ebfc
--radius: 10px
--shadow: 0 2px 8px rgba(0,0,0,0.08)
```

**Logo:** Image-based — `src/assets/logo.png` (a red/black "wa" crest above the "WA! NETWORK ASIA" wordmark), rendered via `<img>` in `Sidebar.jsx`, `LoginForm.jsx`, and `ForcePinChange.jsx`. The plain text `WA!` in red bold is only used standalone on `App.js`'s transient auth-loading screen. PWA icons (`public/favicon.ico`, `logo192.png`, `logo512.png`) are generated from the crest portion of this same logo.

**Layout:**
- Desktop: sidebar navigation (220px) + main content area
- Mobile: hidden sidebar + fixed bottom tab bar (56px height)
- Mobile bottom tabs: Home, Projects, HSE, Workers, More (drawer)
- Main content padding-bottom: 72px on mobile to clear tab bar

---

## FOLDER STRUCTURE

```
src/
├── firebase.js              # Firebase config + exports
├── App.js                   # Router + auth state
├── index.js
├── index.css                # Global CSS variables + resets
├── components/
│   ├── Layout/
│   │   ├── Sidebar.jsx      # Desktop sidebar nav
│   │   ├── MobileNav.jsx    # Bottom tab bar
│   │   ├── Header.jsx       # Top header bar
│   │   └── Layout.jsx       # Main layout wrapper
│   ├── UI/
│   │   ├── Button.jsx
│   │   ├── Card.jsx
│   │   ├── Modal.jsx
│   │   ├── Badge.jsx
│   │   ├── Toast.jsx
│   │   └── StatCard.jsx
│   └── Auth/
│       ├── LoginForm.jsx    # User ID + PIN login
│       └── ForcePinChange.jsx
├── pages/
│   ├── Home.jsx             # Dashboard
│   ├── Projects/
│   │   ├── ProjectList.jsx
│   │   ├── ProjectDetail.jsx
│   │   ├── BlockTracker.jsx
│   │   ├── BlockModal.jsx
│   │   ├── Timeline.jsx
│   │   ├── Reports.jsx
│   │   └── Documents.jsx
│   ├── Workers/
│   │   ├── WorkerRegistry.jsx
│   │   └── WorkerModal.jsx
│   ├── HSE/
│   │   ├── HSEHome.jsx
│   │   └── RALibrary.jsx
│   ├── Staff/               # Placeholder - Phase 6
│   ├── Finance/             # Placeholder - Phase 10
│   ├── Profile.jsx          # Change PIN
│   └── Settings/
│       ├── Settings.jsx
│       ├── UserManagement.jsx
│       └── Permissions.jsx
├── context/
│   ├── AuthContext.jsx      # Current user, role, permissions
│   └── ToastContext.jsx
├── hooks/
│   ├── useAuth.js
│   ├── useFirestore.js
│   └── usePermissions.js
└── utils/
    ├── blockData.js         # PCS Batch 3 seed data
    ├── permissions.js       # Role permission matrix
    └── helpers.js           # Date formatting, stage calc etc
```

---

## MODULES — BUILD ORDER

### Phase 1 (Current — build now)
1. ✅ Firebase setup + Auth
2. ✅ Login (User ID + PIN)
3. ✅ Force PIN change on first login
4. ✅ Dashboard
5. ✅ Projects list + add project
6. ✅ Block tracker (PCS Batch 3 with seed data)
7. ✅ Daily report generator
8. ✅ Worker registry
9. ✅ HSE documents + Dropbox links
10. ✅ Settings + user management

### Phase 2 (Next)
- Claims & PO tracker
- Sub-con payment tracking
- Materials & DO tracking

### Phase 3
- Attendance + GPS clock-in/out
- Leave management (AL/NPL/MC)
- Salary calculator
- Petty cash claims

### Phase 4
- Site photos submission + approval
- Snag/defect list

### Phase 5
- Finance overview
- ITE order form generator

### Phase 6+
- PTW online form + approval workflow
- Toolbox meeting digital form
- Incident reporting
- Service report auto-email to customer

---

## PCS BATCH 3 — BLOCK SEED DATA

Store in `src/utils/blockData.js`. Seed to Firestore on first admin login.

```javascript
// Street clusters and block ranges
// Format: { no, type, street, postal, survey, team, cam, rack, fix1, fix2, fix3, fix4 }

Woodlands Street 13:   101-113, 144-166, 172-179  | RESIDENTIAL | survey: ip
Marsiling Rise:        114-133                      | RESIDENTIAL | survey: ip
Marsiling Road:        134-143                      | RESIDENTIAL | survey: ip
Marsiling Road:        180A, 180B, 180C             | RESIDENTIAL | survey: ip
Marsiling Road:        181                          | MSCP        | survey: ip
Woodlands Street 11:   167-171                      | RESIDENTIAL | survey: ip
Woodlands Street 31:   301-304, 306, 310-319        | RESIDENTIAL | survey: done
Woodlands Street 31:   302A                         | RESIDENTIAL | survey: done
Woodlands Street 31:   305                          | MSCP        | survey: done
Woodlands Avenue 1:    307  | RESIDENTIAL | done | team:kvm | cam:11 | fix1:100 fix2:100 fix3:100 fix4:0
Woodlands Avenue 1:    308  | RESIDENTIAL | done | team:kvm | cam:8  | fix1:100 fix2:100 fix3:100 fix4:0
Woodlands Avenue 1:    309  | RESIDENTIAL | done | team:kvm | cam:2  | fix1:100 fix2:100 fix3:100 fix4:0
Woodlands Street 32:   320-329, 333-335             | RESIDENTIAL | survey: done
Woodlands Avenue 1:    330-332, 351-355, 368-371    | RESIDENTIAL | survey: done
Woodlands Avenue 1:    354A                         | MSCP        | survey: done
Woodlands Avenue 1:    371A                         | MSCP        | survey: done
Woodlands Avenue 5:    356-367                      | RESIDENTIAL | survey: done
Woodlands Avenue 5:    358A                         | MSCP        | survey: done
Woodlands Street 41:   401-406, 408-421             | RESIDENTIAL | survey: ip
Woodlands Street 41:   406A, 413A, 421A             | MSCP        | survey: ip
Woodlands Avenue 5:    905                          | MSCP        | survey: bto
Woodlands Square:      907A, 907B, 907C             | RESIDENTIAL | survey: bto
Woodlands Square:      908A, 908B                   | RESIDENTIAL | survey: bto
North Woodlands Way:   909A, 909B, 909C             | RESIDENTIAL | survey: bto
```

---

## HSE DOCUMENTS — PCS BATCH 3

Pre-load these into Firestore for the PCS Batch 3 project. Default access: none for all teams.

| ID | Name | Dropbox URL |
|----|------|-------------|
| d1 | General Permit-to-Work | https://www.dropbox.com/scl/fi/1ypfdzxo38cxdtuqjbr68/General-Permit-to-Work-NEW-LATEST.pdf?rlkey=yvka98tp1fx6k08jj5yavmz6e&dl=1 |
| d2 | WAH Permit (Rev 04) | https://www.dropbox.com/scl/fi/q40d272amsivm4w9tevyr/WAH-PERMIT-Rev-04-Latest.pdf?rlkey=u9ut38ebo00q6qm6yb67hil2o&dl=1 |
| d3 | Toolbox Meeting Form (Rev 7) | https://www.dropbox.com/scl/fi/4p82jsc9iu6s740m7vkq6/Toolbox-Meeting-Form-Rev-7-LATEST.pdf?rlkey=3coy83ocgiax7wolz89668ict&dl=1 |
| d4 | Daily Safety Harness Checklist | https://www.dropbox.com/scl/fi/ihyyqdry0v4djtfcae6up/SAFETY-HARNESS-CHECKLIST-Rev-01.pdf?rlkey=bpiz7p55h2i5k99edu2bsq7hw&dl=1 |
| d5 | Daily Boom/Scissor Lift Checklist | https://www.dropbox.com/scl/fi/zw4dp1e7bzt22xxqudioh/Daily-Boom-Scissor-lift-Checklist-Rev.1.pdf?rlkey=lz5u9bogb0apjdwnhhe8cyi1m&dl=1 |
| d6 | Daily Ladder Inspection Tag | https://www.dropbox.com/scl/fi/qoq94ma4mhp8re2q4yns0/Daily-Ladder-Inspection-Tag-Rev-02-LATEST.pdf?rlkey=anhjkx7zocbtopn2frlpt9ww4&dl=1 |
| d7 | Monthly Ladder Inspection Record | https://www.dropbox.com/scl/fi/20eid3dcaqvfradnnb8hl/Monthly-Registration-and-Inspection-A-Frame-Ladder-Rev-04.pdf?rlkey=q04jn0qumiog3rlv48bmqzwhu&dl=1 |

---

## DROPBOX FOLDER STRUCTURE

```
/WA! Network Asia CMS/
├── Projects/
│   └── PCS Batch 3/
│       ├── HSE Forms/        ← 7 Certis forms already uploaded here
│       ├── Site Photos/
│       ├── As-Built Drawings/
│       ├── Documents/
│       └── Claims/
├── HSE Library/
│   └── Risk Assessments/
├── Staff/
│   └── Certificates/
└── Templates/
```

---

## FIRESTORE DATA MODEL

```
/users/{userId}
  - userId: string
  - name: string
  - role: owner|manager|supervisor|staff|subcon-admin|subcon
  - team: none|own|kvm|sree|habibur|alamin
  - parentId: string|null (for subcon, points to subcon-admin userId)
  - firstLogin: boolean
  - status: active|inactive
  - createdAt: timestamp

/projects/{projectId}
  - name: string
  - type: string
  - client: string
  - location: string
  - status: active|upcoming|completed
  - startDate: timestamp
  - rates: { s1: number, s2: number, s3: number }
  - assignedTeams: string[]

/projects/{projectId}/blocks/{blockId}
  - no: string
  - type: RESIDENTIAL|MSCP
  - street: string
  - postal: string
  - survey: done|ip|bto
  - team: string
  - cam: number
  - rack: O|I
  - fix1: number (0-100)
  - fix2: number (0-100)
  - fix3: number (0-100)
  - fix4: number (0-100)
  - updatedAt: timestamp
  - updatedBy: string

/projects/{projectId}/documents/{docId}
  - name: string
  - category: hse|drawing|claim|general
  - url: string (Dropbox link)
  - access: { kvm: bool, sree: bool, habibur: bool, alamin: bool, own: bool }
  - uploadedAt: timestamp
  - uploadedBy: string

/workers/{workerId}
  - name: string
  - nric: string (last 4 + letter)
  - designation: string
  - contact: string
  - team: string
  - status: active|inactive
  - certs: array of { name, expiry, status }
  - createdBy: string (userId of subcon-admin or admin)

/raLibrary/{raId}
  - ref: string (e.g. RA 2.0)
  - title: string
  - assessedDate: string
  - reviewDate: string
  - leader: string
  - url: string
  - status: active
```

---

## PERMISSIONS MATRIX

| Feature | Owner | Manager | Supervisor | Staff | Sub-con Admin | Sub-con |
|---------|-------|---------|-----------|-------|---------------|---------|
| View dashboard | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| View projects | ✓ | ✓ | ✓ | ✓ | assigned only | assigned only |
| Update blocks | ✓ | ✓ | ✓ | own team | own team | own team |
| Add/remove blocks | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| View claims | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ |
| Generate reports | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| Manage workers | ✓ | ✓ | ✗ | ✗ | own team | ✗ |
| HSE documents | ✓ | ✓ | ✓ | ✓ | permitted | permitted |
| Create sub-accounts | ✓ | ✓ | ✗ | ✗ | own team only | ✗ |
| Admin settings | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Reset PINs | ✓ | ✓ | ✗ | ✗ | own team | ✗ |

---

## KEY BUSINESS RULES

1. Sub-cons only see projects where at least one block is assigned to their team
2. Sub-cons only see blocks assigned to their team within a project
3. Documents default to NO ACCESS — admin manually enables per team
4. First login always forces PIN change — cannot skip
5. Admin can reset PIN (sets firstLogin:true) but cannot view existing PIN
6. Sub-con admin can create sub-accounts for their own team workers only
7. Worker not found in registry during site check = flag as unregistered
8. Certis forms are download-only (paper submission to Certis required)
9. Claim rates are per-project (not global) — optional field
10. Stage 1 = fix1 AND fix2 both at 100%; Stage 2 = all four fixes at 100%

---

## CURRENT STATUS

- Firebase project created: wa-network-cms ✓
- Firestore database created (asia-southeast1) ✓
- Firebase Auth enabled (Email/Password) ✓
- Firebase Hosting set up ✓
- React app initialized with create-react-app ✓
- Firebase SDK installed ✓
- Dropbox folders created ✓
- 7 Certis HSE forms uploaded to Dropbox ✓
- CLAUDE.md created ✓

**Ready to build.**

---

## NOTES FOR CLAUDE CODE

- Always use functional React components with hooks
- Use CSS modules or styled-components — no Tailwind (keep it lightweight)
- All Firestore operations should have proper error handling
- Seed data should only run once (check if data exists first)
- Mobile-first CSS — design for 375px width, then scale up
- Test on both desktop and mobile viewport
- Keep components small and focused — split if over 200 lines
- Use React Router v6 for navigation
- AuthContext should expose: currentUser, userProfile, loading, login, logout, changePin
- Always handle the loading state to prevent flash of wrong content
