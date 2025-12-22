# Move Closed Issue to Top of Project Column

A GitHub Action that automatically moves closed issues to the top of a specified column in GitHub Project V2.

## Overview

When an issue is closed, this action:
1. Checks if the issue belongs to a specific GitHub Project V2
2. Updates the issue's status to the specified column (default: "Done")
3. **Moves the issue to the TOP of that column**

This ensures that recently closed issues are always visible at the top of your project board.

## Usage

Create a workflow file (e.g., `.github/workflows/move-closed-issue.yaml`):

```yaml
name: Move Closed Issue to Top

on:
  issues:
    types: [closed]

jobs:
  move-to-top:
    runs-on: ubuntu-latest
    steps:
      - uses: wozaki/project-closed-issue-move-to-top-action@v1
        with:
          organization: your-org-or-username
          project-number: 1
          status-name: Done
          github-token: ${{ secrets.PROJECT_PAT }}  # PAT or GitHub App token with project scope
```

## Specification

### Inputs

| Name             | Required | Default                                 | Description                                  |
| ---------------- | -------- | --------------------------------------- | -------------------------------------------- |
| `organization`   | Yes      | -                                       | Organization or User name that owns the project |
| `project-number` | Yes      | -                                       | GitHub Project V2 number                     |
| `status-name`    | No       | `Done`                                  | Target status column name                    |
| `github-token`   | Yes      | -                                       | GitHub token with `project` and `repo` permissions (PAT or GitHub App token) |

### Outputs

None.

