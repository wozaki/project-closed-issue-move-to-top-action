import * as core from '@actions/core'
import type { Octokit } from '@octokit/action'
import type { IssuesEvent } from '@octokit/webhooks-types'
import type { Context } from './github.js'

type Inputs = {
  projectNumber: number
  organization: string
  statusName: string
}

type ProjectItem = {
  id: string
  project: {
    id: string
  }
  fieldValueByName?: {
    name?: string
  }
}

type ProjectQueryResponse = {
  organization?: {
    projectV2?: {
      id: string
    }
  }
  user?: {
    projectV2?: {
      id: string
    }
  }
}

type FieldQueryResponse = {
  node?: {
    field?: {
      id: string
      name: string
      options?: Array<{
        id: string
        name: string
      }>
    }
  }
}

type ProjectItemsQueryResponse = {
  node?: {
    projectItems?: {
      nodes: ProjectItem[]
    }
  }
}

export const run = async (inputs: Inputs, octokit: Octokit, context: Context): Promise<void> => {
  const issueNumber = (context.payload as IssuesEvent).issue.number

  // Get issue node ID from context
  const issueNodeId = (context.payload as IssuesEvent).issue.node_id
  if (!issueNodeId) {
    throw new Error('Issue node ID is not available from the event context')
  }

  // Fetch Project and project item for this issue
  const projectId = await fetchProjectId(octokit, inputs.organization, inputs.projectNumber)
  const projectItem = await fetchProjectItemForIssue(octokit, issueNodeId, projectId)
  if (!projectItem) {
    core.info(`Issue #${issueNumber} not in project, skipping`)
    return
  }

  // Update status if needed
  const currentStatus = projectItem.fieldValueByName?.name
  if (currentStatus !== inputs.statusName) {
    core.info(`Updating status: ${currentStatus || 'none'} → ${inputs.statusName}`)
    const { fieldId, optionId } = await fetchStatusFieldDetails(octokit, projectId, inputs.statusName)
    await updateProjectItemStatus(octokit, projectId, projectItem.id, fieldId, optionId)
  }

  // Move to top
  await moveItemToTop(octokit, projectId, projectItem.id)
  core.info(`✓ Issue #${issueNumber} moved to top of ${inputs.statusName} column`)
}

async function fetchProjectId(octokit: Octokit, organization: string, projectNumber: number): Promise<string> {
  // Try organization first
  const orgQuery = `
    query($organization: String!, $projectNumber: Int!) {
      organization(login: $organization) {
        projectV2(number: $projectNumber) {
          id
        }
      }
    }
  `

  try {
    const orgResponse = await octokit.graphql<ProjectQueryResponse>(orgQuery, {
      organization,
      projectNumber,
    })

    const projectId = orgResponse.organization?.projectV2?.id

    if (projectId) {
      return projectId
    }
  } catch (error) {
    // Only catch NOT_FOUND errors (organization doesn't exist)
    // Re-throw other errors like network errors, auth errors, etc.
    if (isGraphQLError(error) && hasNotFoundError(error)) {
      // Organization not found, will try user query next
    } else {
      throw error
    }
  }

  // Try user as fallback
  const userQuery = `
    query($organization: String!, $projectNumber: Int!) {
      user(login: $organization) {
        projectV2(number: $projectNumber) {
          id
        }
      }
    }
  `

  try {
    const userResponse = await octokit.graphql<ProjectQueryResponse>(userQuery, {
      organization,
      projectNumber,
    })

    const projectId = userResponse?.user?.projectV2?.id

    if (projectId) {
      return projectId
    }
  } catch (error) {
    // Only catch NOT_FOUND errors (user doesn't exist)
    if (isGraphQLError(error) && hasNotFoundError(error)) {
      // User not found, both organization and user queries failed
    } else {
      throw error
    }
  }

  throw new Error(`Project #${projectNumber} not found for ${organization}`)
}

function isGraphQLError(error: unknown): error is { errors?: Array<{ type?: string }> } {
  return typeof error === 'object' && error !== null && 'errors' in error
}

function hasNotFoundError(error: { errors?: Array<{ type?: string }> }): boolean {
  return error.errors?.some((e) => e.type === 'NOT_FOUND') ?? false
}

async function fetchStatusFieldDetails(
  octokit: Octokit,
  projectId: string,
  statusName: string,
): Promise<{ fieldId: string; optionId: string }> {
  const query = `
    query($projectId: ID!, $statusName: String!) {
      node(id: $projectId) {
        ... on ProjectV2 {
          field(name: "Status") {
            ... on ProjectV2SingleSelectField {
              id
              name
              options(names: [$statusName]) {
                id
                name
              }
            }
          }
        }
      }
    }
  `

  const response = await octokit.graphql<FieldQueryResponse>(query, { projectId, statusName })

  const statusField = response.node?.field

  if (!statusField) {
    throw new Error('Status field not found in project')
  }

  const option = statusField.options?.[0]

  if (!option) {
    throw new Error(`Status option "${statusName}" not found in Status field`)
  }

  return {
    fieldId: statusField.id,
    optionId: option.id,
  }
}

async function fetchProjectItemForIssue(
  octokit: Octokit,
  issueNodeId: string,
  projectId: string,
): Promise<ProjectItem | null> {
  const query = `
    query($issueNodeId: ID!) {
      node(id: $issueNodeId) {
        ... on Issue {
          projectItems(first: 10) {
            nodes {
              id
              project {
                id
              }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                }
              }
            }
          }
        }
      }
    }
  `

  const response = await octokit.graphql<ProjectItemsQueryResponse>(query, { issueNodeId })

  const projectItems = response.node?.projectItems?.nodes || []
  const item = projectItems.find((item: ProjectItem) => item.project.id === projectId)

  return item || null
}

async function updateProjectItemStatus(
  octokit: Octokit,
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string,
): Promise<void> {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $value: ProjectV2FieldValue!) {
      updateProjectV2ItemFieldValue(
        input: {
          projectId: $projectId
          itemId: $itemId
          fieldId: $fieldId
          value: $value
        }
      ) {
        projectV2Item {
          id
        }
      }
    }
  `

  await octokit.graphql(mutation, {
    projectId,
    itemId,
    fieldId,
    value: {
      singleSelectOptionId: optionId,
    },
  })
}

async function moveItemToTop(octokit: Octokit, projectId: string, itemId: string): Promise<void> {
  const mutation = `
    mutation($projectId: ID!, $itemId: ID!) {
      updateProjectV2ItemPosition(
        input: {
          projectId: $projectId
          itemId: $itemId
          afterId: null
        }
      ) {
        items(first: 1) {
          nodes {
            id
          }
        }
      }
    }
  `

  await octokit.graphql(mutation, {
    projectId,
    itemId,
  })
}
