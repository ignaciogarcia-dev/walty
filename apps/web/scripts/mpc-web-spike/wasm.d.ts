// esbuild's `--loader:.wasm=file` turns a .wasm import into a string URL.
declare module "*.wasm" {
  const url: string;
  export default url;
}
declare module "@silencelaboratories/dkls-wasm-ll-web/dkls-wasm-ll-web_bg.wasm" {
  const url: string;
  export default url;
}
