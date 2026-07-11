/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PGL_BOOTSTRAP_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
