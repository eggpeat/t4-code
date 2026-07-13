const runtimeExternalDependencies = [
  "node_modules/electron-store/**/*",
  "node_modules/electron-updater/**/*",
  "node_modules/ws/**/*",
];

/** @type {import("electron-builder").Configuration} */
const config = {
  appId: "com.lycaonsolutions.t4code",
  productName: "T4 Code",
  executableName: "t4-code",
  electronVersion: "41.5.0",
  artifactName: "T4-Code-${version}-${os}-${arch}.${ext}",
  directories: {
    app: "apps/desktop",
    output: "release",
  },
  asar: true,
  files: [
    "dist-electron/**/*",
    "package.json",
    ...runtimeExternalDependencies,
    "!**/*.map",
  ],
  extraResources: [
    { from: "apps/web/dist", to: "web" },
    { from: "LICENSE", to: "LICENSE" },
  ],
  protocols: [{ name: "T4 Code", schemes: ["t4-code"] }],
  linux: {
    category: "Development",
    icon: "apps/desktop/build/icons",
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
  },
  mac: {
    category: "public.app-category.developer-tools",
    icon: "apps/desktop/build/icon.png",
    target: [
      { target: "dmg", arch: ["arm64"] },
      { target: "zip", arch: ["arm64"] },
    ],
  },
};

export { runtimeExternalDependencies };
export default config;
