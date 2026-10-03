import { Fragment, useEffect, useMemo, useRef } from 'react'

export interface CodeData {
  file?: string
  code?: string
  /** 1-based lines PEPO added or changed (shown with a quiet mark). */
  changed?: number[]
}

const KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'export', 'import', 'from', 'type', 'interface', 'if', 'else', 'for', 'of', 'in', 'new', 'async', 'await', 'true', 'false', 'null', 'undefined',
])

/** A small, dependency-free highlighter: comments, strings, numbers, keywords, types. */
function tokens(line: string) {
  const out: { t: string; c: string }[] = []
  const re = /(\/\/.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|(\s+)|(.)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(line))) {
    if (m[1]) out.push({ t: m[1], c: 'tok-comment' })
    else if (m[2]) out.push({ t: m[2], c: 'tok-string' })
    else if (m[3]) out.push({ t: m[3], c: 'tok-number' })
    else if (m[4]) out.push({ t: m[4], c: KEYWORDS.has(m[4]) ? 'tok-keyword' : /^[A-Z]/.test(m[4]) ? 'tok-type' : '' })
    else out.push({ t: m[0], c: m[6] && /[{}()[\];,.:=<>]/.test(m[6]) ? 'tok-punct' : '' })
  }
  return out
}

/** A code surface: one file, line numbers, quiet highlighting, PEPO's edits marked. */
export function CodeSurface({ data, writing }: { data: CodeData; writing: boolean }) {
  const lines = useMemo(() => (data.code ?? '').split('\n'), [data.code])
  const changed = useMemo(() => new Set(data.changed ?? []), [data.changed])
  const end = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (writing) end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
  }, [lines.length, writing])

  if (!data.code) {
    return (
      <div className="empty-surface">
        <p>Ask PEPO to open or write code.</p>
      </div>
    )
  }
  return (
    <div className="code-surface">
      <div className="code-tabs">
        <span className="code-tab">{data.file ?? 'untitled'}</span>
      </div>
      <pre className="code-body">
        {lines.map((line, i) => (
          <div key={i} className={`code-line ${changed.has(i + 1) ? 'is-changed' : ''}`}>
            <span className="code-num">{i + 1}</span>
            <code>
              {tokens(line).map((tk, j) => (
                <Fragment key={j}>{tk.c ? <span className={tk.c}>{tk.t}</span> : tk.t}</Fragment>
              ))}
              {writing && i === lines.length - 1 && <span className="caret" aria-hidden="true" />}
            </code>
          </div>
        ))}
        <div ref={end} />
      </pre>
    </div>
  )
}
