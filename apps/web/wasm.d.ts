// wasm-bindgen ships a `_bg.wasm` asset alongside the JS glue. Default-importing
// it yields a same-origin URL string — esbuild's `.wasm=file` loader in the eval
// harness, or Next's asset handling in the app — which wasm-bindgen `init()`
// fetches. Type the import as that URL string.
declare module "*.wasm" {
  const url: string
  export default url
}
