import { useState } from 'react'
import { profile, socials, posts, projects } from './data'

const ASCII_AVATAR = `┌─────────────┐
│             │
│   ( o  o )  │
│      <      │
│    \\___/    │
│             │
└─────────────┘`

function TopNav() {
  return (
    <nav className="topnav">
      <a href="#writing">writing</a>
      <a href="#projects">projects</a>
      <a href="#talks">talks</a>
      <a href="#reading">reading</a>
      <a href={`mailto:${profile.email}`}>contact</a>
    </nav>
  )
}

function Hero() {
  return (
    <header className="hero">
      <div className="hero-photo" aria-hidden="true">
        <pre className="ascii-frame">{ASCII_AVATAR}</pre>
      </div>
      <div className="hero-text">
        <h1>{profile.name}</h1>
        <p className="tagline">{profile.tagline}</p>
        <p className="bio">{profile.bio}</p>
      </div>
    </header>
  )
}

function Socials() {
  return (
    <section className="socials">
      {socials.map((s) => (
        <a key={s.name} className="social" href={s.url}>
          <span className="s-name">{s.name}</span>
          <span className="s-handle">{s.handle}</span>
          <span className="s-count">{s.count}</span>
        </a>
      ))}
    </section>
  )
}

function Writing() {
  return (
    <section id="writing" className="block">
      <h2>recent writing</h2>
      <ul className="entries">
        {posts.map((p) => (
          <li key={p.title}>
            <span className="date">{p.date}</span>
            <a href={p.url}>{p.title}</a>
          </li>
        ))}
      </ul>
      <a className="more" href="#">all posts &nbsp;→</a>
    </section>
  )
}

function Projects() {
  return (
    <section id="projects" className="block">
      <h2>things i'm building</h2>
      <ul className="projects">
        {projects.map((p) => (
          <li key={p.name}>
            <div className="p-head">
              <a href={p.url} className="p-name">{p.name}</a>
              <span className="p-meta">{p.meta}</span>
            </div>
            <p className="p-desc">{p.desc}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}

function Newsletter() {
  const [submitted, setSubmitted] = useState(false)
  return (
    <section id="newsletter" className="block newsletter">
      <h2>newsletter</h2>
      <p>One short post a week on systems engineering. No spam, ever.</p>
      <form
        className="sub"
        onSubmit={(e) => {
          e.preventDefault()
          setSubmitted(true)
        }}
      >
        <input type="email" placeholder="you@domain.com" required />
        <button type="submit">{submitted ? 'thanks ✓' : 'subscribe'}</button>
      </form>
    </section>
  )
}

function Footer() {
  return (
    <footer className="foot">
      <div className="foot-left">© {new Date().getFullYear()} {profile.name}</div>
      <div className="foot-right">
        <a href="#">rss</a>
        <a href="#">github</a>
        <a href="#">twitter</a>
      </div>
    </footer>
  )
}

export default function App() {
  return (
    <div className="page">
      <TopNav />
      <Hero />
      <Socials />
      <hr className="rule" />
      <Writing />
      <hr className="rule" />
      <Projects />
      <hr className="rule" />
      <Newsletter />
      <Footer />
    </div>
  )
}
