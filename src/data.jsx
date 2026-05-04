export const profile = {
  name: 'Your Name',
  tagline: 'engineering, systems, and the occasional database. always building.',
  bio: (
    <>
      I work on <span className="hl">distributed systems</span> and developer tooling.
      Currently building things at <a href="#">Company</a>; previously at{' '}
      <a href="#">PrevCo</a> and <a href="#">EarlierCo</a>. I write about
      databases, infra, and the weird corners of computer science I keep falling into.
    </>
  ),
  email: 'hello@example.com',
}

export const socials = [
  { name: 'github',   handle: '@yourname',    count: '1.2k', url: '#' },
  { name: 'twitter',  handle: '@yourname',    count: '5k',   url: '#' },
  { name: 'linkedin', handle: '/in/yourname', count: '3k',   url: '#' },
  { name: 'youtube',  handle: '@yourname',    count: '800',  url: '#' },
]

export const posts = [
  { date: '2026-04-22', title: 'Why your B-tree is slower than you think',  url: '#' },
  { date: '2026-03-15', title: 'Rebuilding a vector index without downtime', url: '#' },
  { date: '2026-02-04', title: 'Notes on Raft, two years in production',     url: '#' },
  { date: '2026-01-18', title: 'A small language for query plans',           url: '#' },
  { date: '2025-12-02', title: 'The case for boring infrastructure',         url: '#' },
]

export const projects = [
  {
    name: 'project-one',
    meta: 'open source · rust',
    desc: 'A tiny embedded key-value store with a focus on crash safety and zero-config replication.',
    url: '#',
  },
  {
    name: 'project-two',
    meta: 'side project · typescript',
    desc: 'A CLI that turns SQL explain plans into ASCII diagrams you can paste into PR descriptions.',
    url: '#',
  },
  {
    name: 'project-three',
    meta: 'research · python',
    desc: 'Experiments in approximate nearest-neighbor search over compressed embeddings.',
    url: '#',
  },
]
