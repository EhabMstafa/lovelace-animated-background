export interface DocumentData {
  title?: string
  meta?: string
  blocks?: ({ h: string } | { p: string } | { list: string[] })[]
}

/** A document surface: a readable page, not a card. */
export function DocumentSurface({ data }: { data: DocumentData }) {
  if (!data.title) {
    return (
      <div className="empty-surface">
        <p>Ask PEPO to draft or open a document.</p>
      </div>
    )
  }
  return (
    <div className="document-surface">
      <article className="doc-page">
        <h1>{data.title}</h1>
        {data.meta && <p className="doc-meta">{data.meta}</p>}
        {data.blocks?.map((b, i) =>
          'h' in b ? (
            <h2 key={i}>{b.h}</h2>
          ) : 'p' in b ? (
            <p key={i}>{b.p}</p>
          ) : (
            <ul key={i}>
              {b.list.map((li) => (
                <li key={li}>{li}</li>
              ))}
            </ul>
          ),
        )}
      </article>
    </div>
  )
}
