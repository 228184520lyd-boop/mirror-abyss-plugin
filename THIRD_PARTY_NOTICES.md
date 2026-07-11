# Third-Party Notices

Mirror Abyss 1.1.0-alpha.2 contains no bundled third-party runtime library.

The production bundle is generated from this repository's TypeScript source using esbuild. Development-only dependencies are listed in package.json and are not required by SillyTavern at runtime.

SillyTavern provides runtime APIs and shared browser libraries such as localforage. Mirror Abyss accesses those through the SillyTavern global context.

Other extensions were studied only as architectural references. Their code, prompts, CSS, icons, screenshots, and assets are not redistributed.
