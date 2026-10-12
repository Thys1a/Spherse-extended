/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_OSS_PUBLIC_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
