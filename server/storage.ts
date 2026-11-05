import path from 'node:path'

/**
 * Where a set of data lies on disk, in one place: nothing else in the server names these folders. Everything of a
 * runtime stays in its data folder, so each name that comes from a record or a request passes `inside` first.
 */

/** A name for one step of a path. It may not lead out of the folder it is joined to: a refusal here is a bug elsewhere, as routes check their input first. */
function inside(name: string): string {
  if (!name || name === '.' || name === '..' || /[/\\\0]/.test(name)) throw new Error(`Refused a name that would leave its folder: ${JSON.stringify(name)}`)
  return name
}

/** The parts of a data folder. */
export function dataPaths(dataDir: string) {
  return {
    dbFile: path.join(dataDir, 'sessions.db'),
    backupDir: path.join(dataDir, 'backups'),
    filesDir: path.join(dataDir, 'files'),
    themesDir: path.join(dataDir, 'themes'),
  }
}

/** What lies in the files folder. Attachments lie directly in it, under their ids. */
export function filePaths(filesDir: string) {
  const assetsDir = path.join(filesDir, 'assets')
  /** A cut-out's variant for a dark ground (server/cutout.ts): derived from the cut-out when first asked for, kept beside the assets. */
  const darkAssetsDir = path.join(filesDir, 'assets-dark')
  const themeLogosDir = path.join(filesDir, 'theme-logos')
  const themeFilesDir = (id: string) => path.join(filesDir, 'theme-files', inside(id))
  return {
    assetsDir,
    darkAssetsDir,
    themeLogosDir,
    themeFilesDir,
    logo: path.join(filesDir, 'logo'),
    file: (id: string) => path.join(filesDir, inside(id)),
    asset: (hash: string) => path.join(assetsDir, inside(hash)),
    darkAsset: (hash: string) => path.join(darkAssetsDir, inside(hash)),
    themeLogo: (id: string, variant: 'logo' | 'logoLight') => path.join(themeLogosDir, inside(variant === 'logo' ? id : `${id}-light`)),
    /** A file of a data theme, by its path relative to the stylesheet. */
    themeFile: (id: string, file: string) => path.join(themeFilesDir(id), ...file.split('/').map(inside)),
  }
}

/** A file in the folder of a folder theme (data/themes/<name>/…). A step of '.' in its path goes nowhere, and is left out. */
export function themeFolderFile(themesDir: string, name: string, ...file: string[]): string {
  return path.join(themesDir, inside(name), ...file.filter((step) => step !== '.').map(inside))
}
