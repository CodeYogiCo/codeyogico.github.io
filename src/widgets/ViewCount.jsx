import { useEffect, useState } from 'react'

export default function ViewCount({ slug }) {
  const [count, setCount] = useState(null)

  useEffect(() => {
    let cancelled = false
    const path = `/posts/${slug}/`
    const url = `https://codeyogico.goatcounter.com/counter/${encodeURIComponent(path)}.json`
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d) return
        const n = d.count_unique ?? d.count
        if (n != null) setCount(n)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [slug])

  if (count == null) return null
  return <span style={{ fontVariantNumeric: 'tabular-nums' }}>{count} views</span>
}
