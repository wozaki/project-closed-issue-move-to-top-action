import * as assert from 'node:assert'
import { execFile } from 'node:child_process'
import * as fs from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { OWNER, PROJECT_NUMBER, REPOSITORY } from './fixture.js'

export const getToken = (): string => {
  const token = process.env['E2E_GITHUB_TOKEN']
  assert.ok(token, 'E2E_GITHUB_TOKEN is required')
  return token
}

const graphql = async <T>(query: string, variables: Record<string, unknown> = {}): Promise<T> => {
  const response = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { authorization: `bearer ${getToken()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const body = (await response.json()) as { data?: T; errors?: unknown }
  if (!response.ok || body.errors || !body.data) {
    throw new Error(`GraphQL request failed (${response.status}): ${JSON.stringify(body)}`)
  }
  return body.data
}

export type Project = {
  id: string
  statusFieldId: string
  statusOptionIds: Record<string, string>
}

export const fetchProject = async (): Promise<Project> => {
  const data = await graphql<{
    user: {
      projectV2: {
        id: string
        field: { id: string; options: { id: string; name: string }[] }
      }
    }
  }>(
    `query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          id
          field(name: "Status") {
            ... on ProjectV2SingleSelectField { id options { id name } }
          }
        }
      }
    }`,
    { owner: OWNER, number: PROJECT_NUMBER },
  )
  const { id, field } = data.user.projectV2
  return {
    id,
    statusFieldId: field.id,
    statusOptionIds: Object.fromEntries(field.options.map((o) => [o.name, o.id])),
  }
}

export type Item = {
  id: string
  issueNumber: number
  status: string | undefined
}

// Items in the order of the project, which is the order of the board columns.
export const fetchItems = async (): Promise<Item[]> => {
  const data = await graphql<{
    user: {
      projectV2: {
        items: {
          nodes: { id: string; content: { number?: number }; fieldValueByName: { name?: string } | null }[]
        }
      }
    }
  }>(
    `query($owner: String!, $number: Int!) {
      user(login: $owner) {
        projectV2(number: $number) {
          items(first: 100) {
            nodes {
              id
              content { ... on Issue { number } }
              fieldValueByName(name: "Status") {
                ... on ProjectV2ItemFieldSingleSelectValue { name }
              }
            }
          }
        }
      }
    }`,
    { owner: OWNER, number: PROJECT_NUMBER },
  )
  return data.user.projectV2.items.nodes.map((node) => ({
    id: node.id,
    issueNumber: node.content.number ?? 0,
    status: node.fieldValueByName?.name,
  }))
}

export const fetchIssueNodeId = async (issueNumber: number): Promise<string> => {
  const [owner, name] = REPOSITORY.split('/')
  const data = await graphql<{ repository: { issue: { id: string } } }>(
    `query($owner: String!, $name: String!, $number: Int!) {
      repository(owner: $owner, name: $name) { issue(number: $number) { id } }
    }`,
    { owner, name, number: issueNumber },
  )
  return data.repository.issue.id
}

export const setStatus = async (project: Project, itemId: string, status: string): Promise<void> => {
  const optionId = project.statusOptionIds[status]
  assert.ok(optionId, `Status option ${status} must exist in the fixture project`)
  await graphql(
    `mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId, itemId: $itemId, fieldId: $fieldId, value: { singleSelectOptionId: $optionId }
      }) { clientMutationId }
    }`,
    { projectId: project.id, itemId, fieldId: project.statusFieldId, optionId },
  )
}

// Moves the item after afterId, or to the top when afterId is null.
export const moveItem = async (project: Project, itemId: string, afterId: string | null): Promise<void> => {
  await graphql(
    `mutation($projectId: ID!, $itemId: ID!, $afterId: ID) {
      updateProjectV2ItemPosition(input: { projectId: $projectId, itemId: $itemId, afterId: $afterId }) {
        clientMutationId
      }
    }`,
    { projectId: project.id, itemId, afterId },
  )
}

// Project items are eventually consistent: a query right after a mutation may return the previous state.
export const waitForItems = async (description: string, predicate: (items: Item[]) => boolean): Promise<Item[]> => {
  const deadline = Date.now() + 60_000
  for (;;) {
    const items = await fetchItems()
    if (predicate(items)) {
      return items
    }
    if (Date.now() > deadline) {
      throw new Error(`Timed out waiting for ${description}. Items: ${JSON.stringify(items)}`)
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
}

export type ActionResult = {
  exitCode: number
  stdout: string
}

// Runs the built dist/index.js with the environment variables that the Actions runner gives to the action.
// It does not inherit process.env, so that a token in the environment cannot make the test pass.
export const runAction = async (issue: { number: number; nodeId: string }, inputs: Record<string, string>) => {
  const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'e2e-'))
  const eventPath = path.join(tmpdir, 'event.json')
  await fs.writeFile(
    eventPath,
    JSON.stringify({ action: 'closed', issue: { number: issue.number, node_id: issue.nodeId } }),
  )
  const env: Record<string, string> = {
    PATH: process.env['PATH'] ?? '',
    GITHUB_ACTION: 'e2e',
    GITHUB_REPOSITORY: REPOSITORY,
    GITHUB_SHA: '0000000000000000000000000000000000000000',
    GITHUB_EVENT_PATH: eventPath,
  }
  for (const [name, value] of Object.entries(inputs)) {
    env[`INPUT_${name.replace(/ /g, '_').toUpperCase()}`] = value
  }
  return new Promise<ActionResult>((resolve) => {
    execFile(process.execPath, ['dist/index.js'], { env }, (error, stdout, stderr) => {
      process.stdout.write(stdout)
      process.stderr.write(stderr)
      resolve({ exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout })
    })
  })
}
