// Single source of truth for job status labels/colors, shared across
// JobList, JobSummary, JobsBoard, WorkerHome and JobDetail so the status
// vocabulary never drifts between screens.
export const STATUS_CONFIG = {
  scheduled:       { label: 'Pending Arrival', cls: 'pillAmber' },
  'in-progress':   { label: 'Pending Closure', cls: 'pillBlue'  },
  completed:       { label: 'Awaiting Vet',    cls: 'pillPurple' },
  'needs-revision':{ label: 'Needs Revision',  cls: 'pillRed'   },
  vetted:          { label: 'Vetted',          cls: 'pillGreen' },
};
