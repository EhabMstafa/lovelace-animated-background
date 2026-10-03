import { useMemo, useState } from 'react'
import { ChevronRight, File, FileCode2, FileImage, FileSpreadsheet, FileText, Folder, type LucideIcon } from 'lucide-react'

export interface FileNode {
  name: string
  kind: 'folder' | 'doc' | 'pdf' | 'image' | 'sheet' | 'code'
  size?: string
  modified?: string
  children?: FileNode[]
}
export interface FilesData {
  root?: FileNode
  /** Folder names from the root to the folder in view. */
  path?: string[]
  /** Highlighted entry (e.g. what PEPO just found). */
  selected?: string
}

const ICON: Record<FileNode['kind'], LucideIcon> = {
  folder: Folder,
  doc: FileText,
  pdf: File,
  image: FileImage,
  sheet: FileSpreadsheet,
  code: FileCode2,
}

/** A files surface: where you are, what is here, and what PEPO picked out. */
export function FilesSurface({ data }: { data: FilesData }) {
  const [path, setPath] = useState<string[]>(data.path ?? [])
  const [selected, setSelected] = useState<string | undefined>(data.selected)

  const folder = useMemo(() => {
    let node = data.root
    for (const name of path) node = node?.children?.find((c) => c.name === name && c.kind === 'folder')
    return node
  }, [data.root, path])

  if (!data.root || !folder) {
    return (
      <div className="empty-surface">
        <p>Ask PEPO to find a file.</p>
      </div>
    )
  }
  const entries = [...(folder.children ?? [])].sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name))
  const chosen = entries.find((e) => e.name === selected)

  return (
    <div className="files-surface">
      <nav className="crumbs" aria-label="Location">
        {[data.root.name, ...path].map((name, i) => (
          <span key={i} className="crumb">
            {i > 0 && <ChevronRight size={12} strokeWidth={1.6} />}
            <button onClick={() => setPath(path.slice(0, i))} disabled={i === path.length}>
              {name}
            </button>
          </span>
        ))}
      </nav>
      <div className="files-head" aria-hidden="true">
        <span>Name</span>
        <span>Modified</span>
        <span>Size</span>
      </div>
      <ul className="files-list">
        {entries.map((e) => {
          const Icon = ICON[e.kind]
          return (
            <li key={e.name}>
              <button
                className={`file-row ${selected === e.name ? 'is-selected' : ''}`}
                onClick={() => setSelected(e.name)}
                onDoubleClick={() => e.kind === 'folder' && (setPath([...path, e.name]), setSelected(undefined))}
              >
                <span className="file-name">
                  <Icon size={15} strokeWidth={1.4} />
                  {e.name}
                </span>
                <span className="file-meta">{e.modified ?? ''}</span>
                <span className="file-meta">{e.kind === 'folder' ? `${e.children?.length ?? 0} items` : (e.size ?? '')}</span>
              </button>
            </li>
          )
        })}
      </ul>
      {chosen && (
        <div className="files-detail">
          <span>{chosen.name}</span>
          <span>{chosen.kind === 'folder' ? 'Folder · double-click to open' : [chosen.size, chosen.modified].filter(Boolean).join(' · ')}</span>
        </div>
      )}
    </div>
  )
}
