// Déclarations absentes du paquet @journeyapps/wa-sqlite (VFS d'exemple non typé).
declare module '@journeyapps/wa-sqlite/src/examples/OPFSCoopSyncVFS.js' {
  export const OPFSCoopSyncVFS: {
    create(
      name: string,
      module: unknown,
      options?: { getRoot?: () => Promise<FileSystemDirectoryHandle> },
    ): Promise<SQLiteVFS>
  }
}
