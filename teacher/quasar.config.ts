// Quasar config for the Next-Class teacher app
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

const productName = process.env.PRODUCT_NAME || 'Next-Class-Teacher';
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

export default defineConfig((ctx: any) => ({
  boot: ['main'],
  css: ['app.scss'],
  extras: [],

  build: {
    target: { browser: ['es2022', 'chrome115'], node: 'node24' },
    typescript: { strict: true, vueShim: true },
    vueRouterMode: 'hash',
    showBuildSummary: false,

    extendViteConf(viteConf: any) {
      viteConf.server = viteConf.server || {};
      viteConf.server.fs = { ...(viteConf.server.fs || {}), allow: [path.resolve(__dirname, '..'), sharedDir] };
      viteConf.css = viteConf.css || {};
      viteConf.css.preprocessorOptions = { scss: { silenceDeprecations: ['color-functions', 'if-function', 'import', 'global-builtin'] } };
      viteConf.resolve = viteConf.resolve || {};
      viteConf.resolve.alias = { ...viteConf.resolve.alias, 'next-class-shared': sharedDir };

      // Electron production build: renderer into public/, src/assets copied next to it, relative paths for file://
      if (ctx.mode.electron && ctx.prod) {
        const baseOut = viteConf.build?.outDir ?? path.join(__dirname, 'dist', 'electron', 'UnPackaged');
        const publicOut = path.join(baseOut, 'public');
        viteConf.build = viteConf.build || {};
        viteConf.build.outDir = publicOut;
        viteConf.base = './';
        viteConf.publicDir = path.resolve(__dirname, 'public');
        const srcAssetsDir = path.resolve(__dirname, 'src', 'assets');
        viteConf.plugins = viteConf.plugins || [];
        viteConf.plugins.push({
          name: 'next-class-copy-assets',
          closeBundle() {
            fs.cpSync(srcAssetsDir, path.join(publicOut, 'src', 'assets'), { recursive: true });
          },
        });
        viteConf.plugins.push({
          name: 'next-class-rewrite-assets',
          transformIndexHtml: (html: string) => html.replace(/([`"'])\/src\/assets/g, '$1./src/assets').replace(/href=["']public\//g, 'href="./'),
          generateBundle(_: unknown, bundle: Record<string, any>) {
            const rewrite = (s: string) => s.replace(/([`"']|\\["'])\/src\/assets/g, '$1./src/assets');
            for (const item of Object.values(bundle)) {
              if (item?.type === 'chunk' && item.code) item.code = rewrite(item.code);
              if (item?.type === 'asset' && typeof item.source === 'string') item.source = rewrite(item.source);
            }
          },
        });
      }
    },

    rollupOptions: {
      external: ['electron', ...builtinModules, ...Object.keys(pkg.dependencies || {})],
    },
  },

  devServer: { open: false, host: 'localhost', vueDevtools: false },
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
    inspectPort: 5858,
    bundler: 'builder',
    nodeIntegration: true,
    builder: {
      appId: 'com.nextclass.teacher',
      productName,
      buildVersion: `${version}.${buildNumber}`,
      publish: null,
      asar: true,
      asarUnpack: ['public'],
      compression: 'normal',
      electronLanguages: ['en-US', 'en-GB', 'de'],
      files: ['**/*'],
      linux: {
        target: 'AppImage',
        category: 'Education',
        icon: 'public/icons/256x256.png',
        artifactName: artifactNamePattern,
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
          NSLocalNetworkUsageDescription: 'Next-Class macht die Unterrichtseinheit im Schulnetz für die Schüler-App sichtbar.',
        },
      },
      dmg: { sign: false },
      portable: { useZip: false, unpackDirName: 'next-class-teacher', splashImage: 'public/splash.bmp' },
      msi: {
        perMachine: true,
        createDesktopShortcut: true,
        createStartMenuShortcut: true,
        upgradeCode: '55984540-1888-4ac4-a5a6-197b9605fa00',
        shortcutName: 'Next-Class Lehrer',
      },
      win: {
        icon: 'public/icons/icon.ico',
        target: winEbTarget,
        artifactName: artifactNamePattern,
        signExecutable: signEnabled,
      },
      ...(signEnabled && { afterSign: 'scripts/notarize.cjs' }),
    },
  },
}));
