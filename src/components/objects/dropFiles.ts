/** Arquivo selecionado para envio, com o caminho relativo (pastas arrastadas mantêm a estrutura). */
export interface PickedFile {
  file: File
  path: string
}

function readAllEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  const reader = dir.createReader()
  const out: FileSystemEntry[] = []
  return new Promise((resolve, reject) => {
    // readEntries devolve em lotes (~100); chama até vir vazio
    const next = () =>
      reader.readEntries((batch) => {
        if (!batch.length) return resolve(out)
        out.push(...batch)
        next()
      }, reject)
    next()
  })
}

async function walk(entry: FileSystemEntry, base: string, out: PickedFile[]) {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    out.push({ file, path: base + entry.name })
  } else if (entry.isDirectory) {
    for (const child of await readAllEntries(entry as FileSystemDirectoryEntry)) await walk(child, `${base}${entry.name}/`, out)
  }
}

/** Lê arquivos e pastas de um evento de soltar (drag & drop). */
export async function filesFromDrop(dt: DataTransfer): Promise<PickedFile[]> {
  const entries = [...dt.items]
    .filter((i) => i.kind === 'file')
    .map((i) => i.webkitGetAsEntry?.())
    .filter((e): e is FileSystemEntry => !!e)
  if (!entries.length) return [...dt.files].map((file) => ({ file, path: file.name }))
  const out: PickedFile[] = []
  for (const e of entries) await walk(e, '', out)
  return out
}

/** Arquivos de um <input type="file"> (com ou sem webkitdirectory). */
export function filesFromInput(list: FileList | null): PickedFile[] {
  return [...(list ?? [])].map((file) => ({ file, path: file.webkitRelativePath || file.name }))
}
