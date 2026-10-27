// Types for @core/backup (app/public/backup/). The comments at the top of index.js say what each does.

/** a record in the backup: it needs a string `id`; the rest is the app's */
export type Item = { id: string } & Record<string, unknown>;

/** a file the data refers to; the bytes are not in the backup */
export type FileRef = { id: string; name: string; path?: string; size?: number; type?: string };

export type Backup = {
  format: string;
  version: number;
  exportedAt: string;
  space: { id: string; name: string } | null;
  /** the app's settings file, as its settings module wrote it */
  settings: unknown;
  notes: Item[];
  files: FileRef[];
};

export type RestorePlan = {
  /** what is not here yet: the only records a restore writes */
  add: Item[];
  /** records already here, kept as they are */
  present: number;
  /** file names in the backup that this space does not have (restore cannot bring files back) */
  filesMissing: number;
  settings: boolean;
  /** rows or records the file held but that could not be read */
  skipped: number;
};

/** what is here now */
export type Have = {
  noteIds: Iterable<string>;
  fileIds: Iterable<string>;
  /** whether restoring the backup's settings would change any (the app says; without it, they are assumed to) */
  settingsWouldChange?: (settings: unknown) => boolean;
};

export type RestoreIo = {
  /** true once the server's copy has arrived (waits a while, false after that) */
  ready: () => Promise<boolean>;
  have: () => Have;
  /** save records that are not here yet; resolves to how many were refused */
  saveNotes: (notes: Item[]) => Promise<number>;
  /** apply the backup's settings where the app allows (never over a value the person changed) */
  applySettings?: (settings: unknown) => Promise<void>;
};
