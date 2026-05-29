import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(__dirname, '..', 'src', 'pinned.json')
const LOGIN = 'codeyogico'
const TOKEN = process.env.GH_TOKEN || process.env.GITHUB_TOKEN

const QUERY = `
query($login: String!) {
  repositoryOwner(login: $login) {
    ... on User {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            name
            description
            url
            stargazerCount
            primaryLanguage { name }
          }
        }
      }
    }
    ... on Organization {
      pinnedItems(first: 6, types: REPOSITORY) {
        nodes {
          ... on Repository {
            name
            description
            url
            stargazerCount
            primaryLanguage { name }
          }
        }
      }
    }
  }
}`

async function main() {
  if (!TOKEN) {
    console.warn('pinned: no GH_TOKEN / GITHUB_TOKEN — keeping existing src/pinned.json')
    return
  }

  let res
  try {
    res = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        Authorization: `bearer ${TOKEN}`,
        'Content-Type': 'application/json',
        'User-Agent': 'codeyogico-build',
      },
      body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
    })
  } catch (e) {
    console.warn('pinned: network error, keeping existing file', e.message)
    return
  }

  if (!res.ok) {
    console.warn(`pinned: graphql HTTP ${res.status}, keeping existing file`)
    return
  }

  const data = await res.json()
  if (data.errors) {
    console.warn('pinned: graphql errors, keeping existing file', JSON.stringify(data.errors))
    return
  }

  const nodes = data.data?.repositoryOwner?.pinnedItems?.nodes || []
  const repos = nodes
    .filter(Boolean)
    .filter((r) => r.name)
    .map((r) => ({
      name: r.name,
      description: r.description || '',
      url: r.url,
      stars: r.stargazerCount || 0,
      language: r.primaryLanguage?.name || '',
    }))

  await fs.writeFile(OUT, JSON.stringify(repos, null, 2) + '\n', 'utf8')
  console.log(`pinned: wrote ${repos.length} repos to src/pinned.json`)
}

main().catch((e) => {
  console.error('pinned: unexpected error', e)
  process.exit(1)
})
