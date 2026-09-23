export { createDataStore, type CreateDataStoreOptions } from "./data-store.js";
export { parseManifest, parseManifestWithDiagnostics, readManifestFromDoc, readManifestWithDiagnosticsFromDoc, checkManifestHealth, dataManifestSchema } from "./manifest.js";
export { getByDotPath, getRawByDotPath, setByDotPath, deleteByDotPath, stripReservedKeys } from "./dot-path.js";
export { runQuery, decodeCursor } from "./query-engine.js";
export { buildOutline, formatEntrySignature } from "./outline.js";
export { OutlineCache } from "./outline-cache.js";
export { resolveDataFile, isReservedKey } from "./path-guard.js";
export { validateMutationArgs, validateQueryParams } from "./validate.js";
export { createReadDataTool, createQueryDataTool, createMutateDataTool } from "./tools.js";
export { dataCapability } from "./capability.js";
export type {
  DataStore,
  DataChangeEvent,
  DataOrigin,
  Manifest,
  ManifestFieldRule,
  ManifestFieldType,
  ManifestParam,
  ManifestQuery,
  ManifestMutation,
  ManifestHealth,
  ManifestDiagnostic,
  OutlineResult,
  ReadResult,
  QueryResult,
  MutateResult,
  WriteResult,
} from "./types.js";
export {
  VersionConflictError,
  ManifestStaleError,
  UnknownEntryError,
  DataValidationError,
  DataFileCorruptedError,
  ForbiddenKeyError,
} from "./types.js";
