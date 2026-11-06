// Quasar config for the Next-Class student app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-file

import { defineConfig } from '@quasar/app-vite/wrappers';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { builtinModules } from 'module';
import dotenv from 'dotenv';
import pkg from './package.json';

// load .env when present (local dev); otherwise fall back to committed .env.production (CI)
dotenv.config({ path: fs.existsSync('./.env') ? './.env' : './.env.production' });

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sharedDir = path.resolve(__dirname, '..', 'shared');

const buildDate = (() => {
  const now = new Date();
  return now.getFullYear() + String(now.getMonth() + 1).padStart(2, '0') + String(now.getDate()).padStart(2, '0');
})();

const productName = process.env.PRODUCT_NAME || 'Next-Class-Student';
const version = process.env.VERSION || pkg.version;
const buildNumber = process.env.BUILD_NUMBER || '1';
const artifactNamePattern = `${productName}_${version}.${buildNumber}_${buildDate}_\${arch}.\${ext}`;
const signEnabled = process.env.SIGN === 'true';
const winEbTarget = process.env.NXE_EB_WIN_TARGET === 'both'
  ? [{ target: 'msi', arch: ['x64'] as const }, { target: 'portable', arch: ['x64'] as const }]
  : process.env.NXE_EB_WIN_TARGET === 'msi'
    ? [{ target: 'msi', arch: ['x64'] as const }]
    : [{ target: 'portable', arch: ['x64'] as const }];
const macEbArch = process.env.NXE_EB_MAC_ARCH === 'arm64' ? (['arm64'] as const) : (['x64'] as const);

// privileged helper for the internet lock (Go, built by `npm run build:helper` into helper/dist/<goos>-<goarch>)
const helperTarget = process.platform === 'win32' ? 'windows-amd64'
  : process.platform === 'darwin' ? `darwin-${process.env.NXE_EB_MAC_ARCH === 'arm64' ? 'arm64' : 'amd64'}`
    : 'linux-amd64';
const helperResources = [{ from: path.resolve(__dirname, '..', 'helper', 'dist', helperTarget), to: 'helper' }];

// renderer-only deps are bundled by Vite; keep their raw node_modules copies out of the asar
const rendererOnlyAsarExcludes = [
  '!node_modules/@popperjs/core/**',
  '!node_modules/bootstrap/**',
  '!node_modules/quasar/**',
  '!node_modules/sweetalert2/**',
  '!node_modules/validator/**',
  '!node_modules/vue-router/**',
];

export default defineConfig((ctx: any) => ({
  boot: ['main'],
  css: ['app.scss'],
  extras: [],

  build: {
    target: { browser: ['es2022', 'chrome115'], node: 'node24' },
    typescript: { strict: true, vueShim: true },
    vueRouterMode: 'hash',
    publicPath: '/',
    minify: true,
    showBuildSummary: false,

    extendViteConf(viteConf: any) {
      viteConf.server = viteConf.server || {};
      viteConf.server.fs = { ...(viteConf.server.fs || {}), allow: [path.resolve(__dirname, '..'), sharedDir] };
      viteConf.css = viteConf.css || {};
      viteConf.css.preprocessorOptions = { scss: { silenceDeprecations: ['color-functions', 'if-function', 'import', 'global-builtin'] } };
      viteConf.resolve = viteConf.resolve || {};
      viteConf.resolve.alias = { ...viteConf.resolve.alias, 'next-class-shared': sharedDir };

      // Electron production build: renderer goes into public/ (single copy), relative asset paths for file://
      if (ctx.mode.electron && ctx.prod) {
        const baseOut = viteConf.build?.outDir ?? path.join(__dirname, 'dist', 'electron', 'UnPackaged');
        viteConf.build = viteConf.build || {};
        viteConf.build.outDir = path.join(baseOut, 'public');
        viteConf.build.cssCodeSplit = false;
        viteConf.base = './';
        viteConf.publicDir = path.resolve(__dirname, 'public');
        viteConf.plugins = viteConf.plugins || [];
        viteConf.plugins.push({
          name: 'next-class-rewrite-assets',
          transformIndexHtml: (html: string) => html.replace(/([`"'])\/img\//g, '$1./img/').replace(/href=["']public\//g, 'href="./'),
          generateBundle(_: unknown, bundle: Record<string, any>) {
            const rewrite = (s: string) => s.replace(/([`"']|\\["'])\/img\//g, '$1./img/');
            for (const item of Object.values(bundle)) {
              if (item?.type === 'chunk' && item.code) item.code = rewrite(item.code);
            }
          },
        });
      }
    },

    rollupOptions: {
      external: ctx.mode.electron ? ['electron', ...builtinModules, ...Object.keys(pkg.dependencies || {})] : [],
    },
  },

  devServer: { open: false, host: 'localhost', port: 9300, vueDevtools: false },
  framework: { config: {}, plugins: [] },
  animations: [],

  sourceFiles: {
    rootComponent: 'src/App.vue',
    router: 'src/router/index',
    electronMain: 'src-electron/electron-main',
    electronPreload: 'src-electron/electron-preload',
  },

  electron: {
    preloadScripts: ['electron-preload'],
    inspectPort: Number(process.env.NXE_ELECTRON_INSPECT_PORT || 5858),
    bundler: 'builder',
    nodeIntegration: true,
    builder: {
      appId: 'com.nextclass.student',
      productName,
      buildVersion: `${version}.${buildNumber}`,
      publish: null,
      asar: { smartUnpack: true },
      asarUnpack: ['public/**/*'],
      extraResources: helperResources,
      compression: 'normal',
      electronLanguages: ['en-US', 'en-GB', 'de'],
      linux: {
        target: 'AppImage',
        category: 'Education',
        icon: 'public/icons/256x256.png',
        artifactName: artifactNamePattern,
        files: ['**/*', ...rendererOnlyAsarExcludes],
      },
      mac: {
        icon: 'public/icons/icon.png',
        artifactName: artifactNamePattern,
        hardenedRuntime: signEnabled,
        gatekeeperAssess: false,
        entitlements: 'scripts/entitlements.mac.plist',
        entitlementsInherit: 'scripts/entitlements.mac.plist',
        category: 'public.app-category.education',
        target: { target: 'dmg', arch: macEbArch },
        // unsigned builds (decision: no code signing for now) - ad-hoc identity
        ...(signEnabled ? {} : { identity: null }),
        extendInfo: {
          NSScreenCaptureUsageDescription: 'Next-Class zeigt der Lehrkraft während der Unterrichtseinheit deinen Bildschirm.',
          NSLocalNetworkUsageDescription: 'Next-Class sucht im Schulnetz nach der Lehrer-App.',
        },
        files: ['**/*', ...rendererOnlyAsarExcludes],
      },
      dmg: { sign: false },
      portable: { useZip: true, unpackDirName: 'next-class-student', splashImage: 'public/splash.bmp' },
      msi: {
        perMachine: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        upgradeCode: 'f3fdaecc-ad4b-4eb6-924a-b177892999b5',
        shortcutName: 'Next-Class Schüler',
      },
      win: {
        icon: 'public/icons/icon.ico',
        target: winEbTarget,
        artifactName: artifactNamePattern,
        files: ['**/*', ...rendererOnlyAsarExcludes],
        signAndEditExecutable: signEnabled,
      },
      ...(signEnabled && { afterSign: 'scripts/notarize.cjs' }),
    },
  },
}));
