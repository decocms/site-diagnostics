declare module "*.wasm" {
	const asset: string | ArrayBuffer | Uint8Array | WebAssembly.Module;
	export default asset;
}

declare module "*.woff" {
	const asset: string | ArrayBuffer | Uint8Array;
	export default asset;
}

declare module "*.ttf" {
	const asset: string | ArrayBuffer | Uint8Array;
	export default asset;
}

declare module "*.png" {
	const asset: string | ArrayBuffer | Uint8Array;
	export default asset;
}
