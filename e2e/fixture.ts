// The fixture project and issues the e2e tests run against.
// Their setup is documented in e2e/README.md.

export const OWNER = 'wozaki'

export const PROJECT_NUMBER = 8

// The action reads the issue from the event payload, so the repository only matters for the default owner.
export const REPOSITORY = 'wozaki/sandbox-issue'

// Closed issues in wozaki/sandbox-issue with the label `e2e-move-to-top`.
export const ISSUES = {
  // Kept at the top in Done, so that the issue under test starts below another item.
  anchor: 70,
  todo: 71,
  done: 72,
  notInProject: 73,
} as const
