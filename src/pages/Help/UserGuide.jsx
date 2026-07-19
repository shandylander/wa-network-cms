import React from 'react';
import {
  KeyIcon, HomeIcon, WrenchScrewdriverIcon, ClockIcon, CalendarDaysIcon,
  BanknotesIcon, DocumentTextIcon, LightBulbIcon, Squares2X2Icon, FolderIcon,
  BuildingStorefrontIcon, UsersIcon, IdentificationIcon, CurrencyDollarIcon,
  BookOpenIcon, MegaphoneIcon, Cog6ToothIcon, DocumentMagnifyingGlassIcon,
  SparklesIcon, ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../../context/AuthContext';
import Card from '../../components/UI/Card';
import Badge from '../../components/UI/Badge';
import styles from './UserGuide.module.css';

// Content is data-driven so both the worker guide and the admin guide can
// share one renderer — each section is a flexible list of typed blocks
// (steps / ref / table / tip / warn) rather than bespoke JSX per section.

const WORKER_SECTIONS = [
  {
    id: 'login', icon: KeyIcon, title: 'Logging In',
    desc: 'Your supervisor gives you a User ID and a PIN — no email address needed.',
    blocks: [
      { type: 'steps', items: [
        { t: 'Enter your User ID and PIN', d: 'Type your User ID (e.g. WK004) and your 6-digit PIN, then tap Log In.' },
        { t: 'First time logging in? Set a new PIN', d: 'The app asks you to choose your own 6-digit PIN before you continue. Pick something you’ll remember — only you should know it.' },
        { t: 'Choose your language', d: 'Tap the language pill (EN / বাংলা / தமிழ்) at the top of Home any time to switch. Your choice is remembered.' },
      ] },
      { type: 'tip', text: <><b>Forgot your PIN?</b> You can’t see or reset it yourself — ask your supervisor or office admin to reset it for you.</> },
    ],
  },
  {
    id: 'home', icon: HomeIcon, title: 'Home Screen',
    desc: 'The first screen you see after logging in.',
    blocks: [
      { type: 'ref', items: [
        { t: 'Today’s Jobs', d: 'Any service job assigned to you shows as a card here — tap it to open.' },
      ] },
      { type: 'qa', items: [
        { icon: ClockIcon, label: 'Attendance' },
        { icon: CalendarDaysIcon, label: 'Leave' },
        { icon: BanknotesIcon, label: 'Petty Cash' },
        { icon: MegaphoneIcon, label: 'Announcements' },
      ] },
    ],
  },
  {
    id: 'jobs', icon: WrenchScrewdriverIcon, title: 'Service Jobs',
    desc: 'If you’re scheduled to visit a customer site, the job appears on your Home screen.',
    blocks: [
      { type: 'steps', items: [
        { t: 'Open the job', d: 'Tap the job card — see the customer name, site address (tap for directions), appointment time and contact person.' },
        { t: 'Check in when you arrive', d: 'Tap Check In on site — records your GPS location and time so the office knows you’ve arrived.' },
        { t: 'Do the work, take photos', d: 'Upload site/work photos and any documents as you go, if the job asks for them.' },
        { t: 'Complete & sign', d: 'Tap Complete Job, fill in equipment used and job details, then get the customer to sign on your screen.' },
      ] },
      { type: 'subhead', text: 'What the status means' },
      { type: 'table', headers: ['Status', 'Meaning'], rows: [
        [{ badge: 'blue', text: 'Pending Arrival' }, 'Scheduled — you haven’t checked in yet.'],
        [{ badge: 'amber', text: 'Pending Closure' }, 'You’ve checked in — finish the work and submit your report.'],
        [{ badge: 'purple', text: 'Awaiting Vet' }, 'You’ve submitted — the office is reviewing it.'],
        [{ badge: 'red', text: 'Needs Revision' }, 'The office found something to fix — open the job and correct it.'],
        [{ badge: 'green', text: 'Vetted' }, 'Approved. Nothing more to do.'],
      ] },
      { type: 'warn', text: <><b>Needs Revision?</b> Open the job, see the office’s note, fix what’s asked, and resubmit.</> },
    ],
  },
  {
    id: 'clock', icon: ClockIcon, title: 'Clock In / Out (Attendance)',
    desc: 'A simple 3-step process, guided on screen every time.',
    blocks: [
      { type: 'steps', items: [
        { t: 'Locate', d: 'The app checks your GPS location — make sure location is turned on.' },
        { t: 'Selfie', d: 'Take a quick photo of yourself to confirm it’s you.' },
        { t: 'Confirm', d: 'Review and confirm — you’re clocked in. Repeat at the end of your shift to clock out.' },
      ] },
      { type: 'tip', text: 'Your last 30 days of attendance and a monthly summary are shown on the same screen.' },
    ],
  },
  {
    id: 'leave', icon: CalendarDaysIcon, title: 'Applying for Leave',
    desc: 'Covers Annual Leave (AL), Medical Certificate (MC), No-Pay Leave (NPL) and Off-in-Lieu (OIL).',
    blocks: [
      { type: 'steps', items: [
        { t: 'Pick the leave type', d: 'Choose AL, MC, NPL or OIL from Leave in Quick Access.' },
        { t: 'MC: photograph your certificate', d: 'The app reads the clinic name and dates off the photo automatically. Check the details before continuing — if the photo’s too blurry, just type the dates in yourself.' },
        { t: 'Add a reason and submit', d: 'Review your remaining AL/MC balance, confirm, and submit for approval.' },
      ] },
      { type: 'tip', text: <><b>Changed your mind?</b> You can edit or cancel an application yourself, but only while it’s still <b>pending</b> — once approved or rejected, it’s locked.</> },
    ],
  },
  {
    id: 'claims', icon: BanknotesIcon, title: 'Petty Cash Claims',
    desc: 'Claim back money you’ve spent — for example, transport or small tools.',
    blocks: [
      { type: 'steps', items: [
        { t: 'Photograph the receipt', d: 'Open Petty Cash in Quick Access and take a photo of your receipt.' },
        { t: 'Check the auto-filled details', d: 'Amount, date and category are read automatically — correct anything wrong, then submit.' },
      ] },
      { type: 'tip', text: 'The app warns you if you try to submit the same receipt twice. Pending claims can be edited or cancelled — once approved, they’re final.' },
    ],
  },
  {
    id: 'docs', icon: DocumentTextIcon, title: 'My Documents (Profile)',
    desc: 'If your account is linked to your Site Workforce record, your certificates, passes, permits and licenses are all in one place — ready to show a client or safety inspector on the spot.',
    blocks: [
      { type: 'steps', items: [
        { t: 'Open Profile', d: 'If you have documents on file, you’ll see "My Documents" listed there.' },
        { t: 'Tap any document to view it', d: 'Opens right in the app — no download needed. Shows whether it’s Valid, Expiring soon, or Expired.' },
      ] },
      { type: 'tip', text: 'Your profile photo and documents are uploaded by your admin, not by you. If something’s missing or wrong, ask your office to update it.' },
    ],
  },
  {
    id: 'help', icon: LightBulbIcon, title: 'Tips & Help',
    desc: null,
    blocks: [
      { type: 'ref', items: [
        { t: 'Blurry photo?', d: 'Any time the app reads a document photo (MC, receipt, certificate) and gets it wrong or can’t read it, you can always type the details in by hand instead.' },
        { t: 'Changing your PIN', d: 'Go to Profile → Change PIN. You’ll need your current PIN first.' },
        { t: 'Announcements', d: 'Check regularly — this is where the office posts company-wide updates and notices.' },
      ] },
    ],
  },
];

const ADMIN_SECTIONS = [
  {
    id: 'start', icon: BookOpenIcon, title: 'Getting Started', path: null,
    desc: 'Owner, Manager and Supervisor accounts see the full admin panel described below. Staff and Sub-con accounts get the simplified mobile Worker Portal instead.',
    blocks: [
      { type: 'subhead', text: 'How access actually works' },
      { type: 'ref', items: [
        { t: 'Access Levels are the real permission system', d: 'not your role name. Every account’s role gives it a starting bundle of access when created, but Settings → Access Levels lets an Owner or Manager freely reassign who can see/do what, any time, without changing anyone’s role.' },
        { t: 'Think in terms of "what can this account do"', d: 'not "what role is this account" — check Settings → Access Levels or Settings → Permissions if something seems to be showing or hiding unexpectedly.' },
      ] },
      { type: 'subhead', text: 'Finding your way around' },
      { type: 'ref', items: [
        { t: 'Desktop', d: 'left sidebar, grouped into Overview / Operations / People / Company / Account zones.' },
        { t: 'Mobile', d: 'bottom tab bar (your first permitted zones + Employees), plus a "More" drawer for everything else.' },
      ] },
    ],
  },
  {
    id: 'dashboard', icon: Squares2X2Icon, title: 'Dashboard', path: '/',
    desc: 'Key numbers, a "Needs Attention" feed (each item deep-links to the page it concerns — expiring certs, jobs waiting to be vetted, ageing claims), and project overview cards. Tailored to your role.',
    blocks: [
      { type: 'tip', text: 'Quick actions live here too — importing a WhatsApp daily site report and scheduling a service job are both one tap away.' },
    ],
  },
  {
    id: 'projects', icon: FolderIcon, title: 'Projects', path: '/projects',
    desc: 'Everything to do with running a CCTV installation or similar project lives inside a project’s detail page, in tabs — which tabs appear depends on the project’s work type.',
    blocks: [
      { type: 'subhead', text: 'Adding a project' },
      { type: 'steps', items: [
        { t: 'Projects → Add Project', d: 'Pick a work type — this decides which tabs the project gets.' },
        { t: 'Fill in client, location and rates', d: 'Rates are per-project and optional.' },
      ] },
      { type: 'subhead', text: 'What’s inside a project' },
      { type: 'ref', items: [
        { t: 'Blocks', d: 'table or drag-drop kanban view of installation progress per block/unit.' },
        { t: 'Claims', d: 'main-contractor claim tracking, sub-con rate configuration, and a sub-con payment summary.' },
        { t: 'Materials', d: 'material/DO tracking and order approval, plus a printable ITE order form generator.' },
        { t: 'Site Photos', d: 'crew-submitted photos with an approval workflow.' },
        { t: 'Snag List', d: 'defects logged with severity and status.' },
        { t: 'Permits', d: 'Permit-to-Work (general and Working-at-Height), pending/approved/rejected.' },
        { t: 'Toolbox Meeting', d: 'digital toolbox meeting log.' },
        { t: 'Incident Reports', d: 'near-miss, first-aid, MC and property-damage logging.' },
        { t: 'Documents', d: 'per-project document library with per-team access flags.' },
        { t: 'Notes', d: 'a simple timestamped feed on the Overview tab for the team to leave updates, tagged with who posted.' },
        { t: 'Daily WhatsApp Report', d: 'generate the day’s report, or paste one back in to bulk-update block progress.' },
      ] },
    ],
  },
  {
    id: 'jobs', icon: WrenchScrewdriverIcon, title: 'Service Jobs', path: '/jobs',
    desc: 'The technician dispatch and reporting system — separate from Projects, used for one-off or scheduled customer service visits.',
    blocks: [
      { type: 'subhead', text: 'Scheduling a job' },
      { type: 'steps', items: [
        { t: 'Service Jobs → Schedule Job', d: 'Pick the customer — if already on file, site address, contact and phone pre-fill automatically.' },
        { t: 'Assign crew and time', d: 'Choose one or more technicians and an appointment time.' },
      ] },
      { type: 'subhead', text: 'Three ways to view jobs' },
      { type: 'ref', items: [
        { t: 'List', d: 'the default, also embedded on Customer/Project pages.' },
        { t: 'Board', d: 'kanban by status. Only Awaiting Vet cards can be dragged — into Vetted or Needs Revision — every other status is driven by the technician’s own GPS check-in.' },
        { t: 'Calendar', d: 'a week view of technicians × days; drag a job to reschedule or reassign it.' },
      ] },
      { type: 'tip', text: 'A not-yet-completed job now shows a live "Job Status" panel — customer info, crew check-in state, progress steps — instead of a blank report.' },
    ],
  },
  {
    id: 'customers', icon: BuildingStorefrontIcon, title: 'Customers', path: '/customers',
    desc: 'Your customer/client directory. Each customer’s detail page shows their job history and documents on file. Site address and contact entered here auto-fill when you schedule a Service Job for them.',
    blocks: [],
  },
  {
    id: 'workforce', icon: UsersIcon, title: 'Site Workforce', path: '/workers',
    desc: 'Your worker registry — direct staff and sub-contractor crew, with certifications, licenses and photos.',
    blocks: [
      { type: 'subhead', text: 'Adding a worker & their certificates' },
      { type: 'steps', items: [
        { t: 'Site Workforce → Add Worker', d: 'Enter name, NRIC, designation, contact and team.' },
        { t: 'Photograph a cert, pass or license', d: 'The app reads the course/cert name, issue date and expiry date off the photo automatically and fills the form. If it’s too blurry, just fill the fields in by hand — nothing is blocked.' },
        { t: 'Optional: add a photo of the worker', d: 'Shown next to their name in the registry and on their own Profile.' },
        { t: 'Link to a login account', d: 'If the worker has a User ID/PIN login, link it here — they’ll then see their own certs and photo under Profile → My Documents.' },
      ] },
      { type: 'tip', text: <>Certificate status is colour-coded automatically: <Badge color="green">Valid</Badge> <Badge color="amber">Expiring soon</Badge> <Badge color="red">Expired</Badge></> },
    ],
  },
  {
    id: 'people', icon: IdentificationIcon, title: 'Attendance / Leave / Salary / Petty Cash', path: '/attendance · /leave · /salary · /petty-cash',
    desc: 'Grouped under "Employees" in the sidebar — day-to-day HR for your directly employed staff.',
    blocks: [
      { type: 'subhead', text: 'Attendance' },
      { type: 'ref', items: [
        { t: 'Team View', d: 'see and edit your team’s clock in/out records.' },
        { t: 'Photo Review', d: 'check the GPS + selfie captured at each clock in/out, with a date-range picker.' },
        { t: 'Subcon Audit', d: 'sub-con admins get their own read-only audit of their own team’s attendance.' },
      ] },
      { type: 'subhead', text: 'Leave' },
      { type: 'ref', items: [
        { t: 'Approval Queue', d: 'review and approve/reject pending AL, MC, NPL, OIL (and CCL/HL for direct staff).' },
        { t: 'Team Calendar', d: 'month grid of who’s off when, coloured by type, with Singapore public holidays marked.' },
        { t: 'Leave Settings', d: 'configure entitlements and carry-forward rules.' },
      ] },
      { type: 'subhead', text: 'Salary' },
      { type: 'ref', items: [
        { t: 'Pay Config', d: 'per-worker pay rate, CPF residency status and allowances.' },
        { t: 'Payslip Generator', d: 'MOM-compliant itemised payslips (CPF auto-calculated by age band and residency), printable, with CSV export for CPF/IR8A filing.' },
      ] },
      { type: 'subhead', text: 'Petty Cash' },
      { type: 'ref', items: [
        { t: 'Approvals', d: 'approve or reject claims (each includes the receipt photo and OCR-read amount/date). Review approved-but-unpaid claims periodically for ageing.' },
      ] },
      { type: 'warn', text: <>Staff can now withdraw their own <b>pending</b> leave, MC and petty cash applications themselves — once you approve or reject one, it locks.</> },
    ],
  },
  {
    id: 'finance', icon: CurrencyDollarIcon, title: 'Finance', path: '/finance',
    desc: 'A read-only company-wide overview — claims total, sub-con liability, materials cost, petty cash outstanding and similar figures, pulled from the other modules. Nothing is entered here directly.',
    blocks: [],
  },
  {
    id: 'resources', icon: BookOpenIcon, title: 'Resources', path: '/resources',
    desc: 'The company-wide document library — HSE & Safety, Training, Standards, Templates and Policies. Documents default to no access; switch on visibility per sub-con team explicitly. Everything opens for viewing directly in the app.',
    blocks: [],
  },
  {
    id: 'announce', icon: MegaphoneIcon, title: 'Announcements', path: '/announcements',
    desc: 'The company bulletin board — post updates with a severity level and attachments; everyone sees read receipts. The system also posts here automatically for new leave/petty cash submissions and incident reports, so it doubles as a live activity feed.',
    blocks: [],
  },
  {
    id: 'settings', icon: Cog6ToothIcon, title: 'Settings', path: '/settings',
    desc: null,
    blocks: [
      { type: 'subhead', text: 'User Management' },
      { type: 'ref', items: [{ t: '', d: 'Create accounts, reset a forgotten PIN (forces that user to set a new one on next login), and assign roles/Access Levels.' }] },
      { type: 'subhead', text: 'Access Levels — the real permission mechanism' },
      { type: 'ref', items: [{ t: '', d: 'Owner and Manager only. Create or edit named bundles of permissions and assign them to any account — this is what actually controls access.' }] },
      { type: 'subhead', text: 'Permissions' },
      { type: 'ref', items: [{ t: '', d: 'A read-only matrix showing exactly which Access Level grants which capability.' }] },
    ],
  },
  {
    id: 'audit', icon: DocumentMagnifyingGlassIcon, title: 'Uploads Audit', path: '/audit',
    desc: 'A cross-cutting view of every file staff have uploaded — attendance selfies, MCs, receipts, certificates — with type and date-range filters, and a Cards/Table view toggle. The table view is sortable by any column and includes Reviewed By / Reviewed At — this is where to check the audit trail of who approved or rejected an MC or receipt.',
    blocks: [
      { type: 'warn', text: 'This page currently has no link in the desktop sidebar — reach it by typing /audit directly, or via the mobile "More" drawer.' },
    ],
  },
  {
    id: 'tips', icon: SparklesIcon, title: 'Handy Features', path: null,
    desc: null,
    blocks: [
      { type: 'ref', items: [
        { t: 'Quick date ranges', d: 'every date-range picker in the app (Uploads Audit, Team Attendance, Photo Review, etc.) has one-tap "Today / This Week / This Month / Last 7 / Last 30" buttons alongside manual From/To fields.' },
        { t: 'Sortable table views', d: 'after loading a date range in Uploads Audit, switch to Table view and click any column header to sort.' },
        { t: 'Submitted date vs. document date', d: 'petty cash receipts show both the receipt’s own date and the date it was actually submitted.' },
      ] },
    ],
  },
  {
    id: 'gaps', icon: ExclamationTriangleIcon, title: 'Known Gaps — worth knowing before you test', path: null,
    desc: null,
    blocks: [
      { type: 'ref', items: [
        { t: 'No auto-email of service reports', d: 'the printable Job Summary report doesn’t email itself to the customer yet — print/PDF only for now.' },
        { t: 'App Check is not yet switched on', d: 'needs a one-time Firebase console setup step before it can be enabled.' },
        { t: 'Worker-portal translations (Bengali/Tamil) are machine-generated', d: 'flag any wording issues you spot; not yet checked by a native speaker.' },
      ] },
    ],
  },
];

function Block({ block }) {
  if (block.type === 'subhead') return <p className={styles.subhead}>{block.text}</p>;

  if (block.type === 'steps') return (
    <ul className={styles.stepList}>
      {block.items.map((it, i) => (
        <li className={styles.step} key={i}>
          <span className={styles.stepNo}>{i + 1}</span>
          <div className={styles.stepBody}><b>{it.t}</b><span>{it.d}</span></div>
        </li>
      ))}
    </ul>
  );

  if (block.type === 'ref') return (
    <ul className={styles.refList}>
      {block.items.map((it, i) => (
        <li className={styles.refItem} key={i}>{it.t && <b>{it.t}</b>} <span>{it.d}</span></li>
      ))}
    </ul>
  );

  if (block.type === 'table') return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead><tr>{block.headers.map(h => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>
          {block.rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell && cell.badge ? <Badge color={cell.badge}>{cell.text}</Badge> : cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (block.type === 'qa') return (
    <div className={styles.qaGrid}>
      {block.items.map(({ icon: Icon, label }) => (
        <div className={styles.qaItem} key={label}><Icon /><span>{label}</span></div>
      ))}
    </div>
  );

  if (block.type === 'tip' || block.type === 'warn') return (
    <div className={[styles.callout, styles[block.type]].join(' ')}>
      <span className={styles.calloutDot} />
      <div>{block.text}</div>
    </div>
  );

  return null;
}

function Section({ section }) {
  const Icon = section.icon;
  return (
    <Card className={styles.section} id={section.id}>
      <div className={styles.secHead}>
        <div className={styles.secIcon}><Icon /></div>
        <h2 className={styles.secTitle}>{section.title}</h2>
        {section.path && <span className={styles.secPath}>{section.path}</span>}
      </div>
      {section.desc && <p className={styles.secDesc}>{section.desc}</p>}
      {section.blocks.map((b, i) => <Block block={b} key={i} />)}
    </Card>
  );
}

export default function UserGuide() {
  const { userProfile } = useAuth();
  const isWorker = userProfile?.role === 'staff' || userProfile?.role === 'subcon';
  const sections = isWorker ? WORKER_SECTIONS : ADMIN_SECTIONS;

  return (
    <div className={[styles.page, isWorker ? '' : styles.wide].join(' ')}>
      <div className={styles.intro}>
        <span className={styles.audience}>
          <BookOpenIcon width={14} />
          {isWorker ? 'Worker Portal Guide' : 'Admin Panel Guide'}
        </span>
        <h1 className={styles.introTitle}>{isWorker ? 'How to use the app' : 'User Guide'}</h1>
        <p className={styles.introSub}>
          {isWorker
            ? 'Clocking in, service jobs, leave, petty cash claims and your documents — one action per screen.'
            : 'A reference for using the WA! Network Asia admin panel — every module, plus handy features and known gaps.'}
        </p>
      </div>

      <nav className={styles.pillbar}>
        {sections.map(s => <a key={s.id} href={`#${s.id}`} className={styles.pill}>{s.title}</a>)}
      </nav>

      {sections.map(s => <Section section={s} key={s.id} />)}
    </div>
  );
}
