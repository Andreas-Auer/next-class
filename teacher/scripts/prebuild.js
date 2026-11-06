import fs from 'fs';
import dotenv from 'dotenv';

// load .env when present (local dev); otherwise fall back to committed .env.production (CI)
const envFile = fs.existsSync('./.env') ? './.env' : './.env.production';
dotenv.config({ path: envFile });
console.log(`📦 prebuild loaded env from ${envFile}`);

const now = new Date();
const buildDate = now.getFullYear() +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0');

// 1. write src-electron/main/config.js from .env
const configJsContent = `/**
 * DO NOT EDIT - this file is written by prebuild.js from .env - edit vars in .env file!
 */

const config = {
    development: ${process.env.DEVELOPMENT === 'true'},
    showdevtools: ${process.env.SHOWDEVTOOLS === 'true'},

    workdirectory: "",
    tempdirectory: "",
    serverdirectory: '${process.env.CLIENT_DIRECTORY}',

    serverApiPort: ${process.env.SERVER_API_PORT},
    multicastClientPort: ${process.env.MULTICAST_CLIENT_PORT},
    multicastServerClientPort: ${process.env.MULTICAST_SERVER_CLIENT_PORT},
    multicastServerAdrr: '${process.env.MULTICAST_ADDRESS || '239.255.42.1'}',

    hostip: "0.0.0.0",
    gateway: true,
    examServerList: {},   // running sessions on this teacher app, keyed by session name

    version: '${process.env.VERSION}.${process.env.BUILD_NUMBER}',
    buildDate: '${buildDate}',
    buildNumber: '${process.env.BUILD_NUMBER}',
    info: '${process.env.INFO}'
}
export default config;
`;
fs.writeFileSync('./src-electron/main/config.js', configJsContent);

// 2. inject app secrets (placeholder "NEXT-CLASS" in .env.production; CI may overwrite via secrets)
const apiSecret = process.env.API_SECRET || 'NEXT-CLASS';
const connectionSecret = process.env.CONNECTION_SECRET || 'NEXT-CLASS';
const secretPath = '../shared/apiSecret.js';
let secretContent = fs.readFileSync(secretPath, 'utf8');
secretContent = secretContent
    .replace(/export const API_SECRET = '.*?';/, `export const API_SECRET = '${apiSecret}';`)
    .replace(/export const CONNECTION_SECRET = '.*?';/, `export const CONNECTION_SECRET = '${connectionSecret}';`);
fs.writeFileSync(secretPath, secretContent);
console.log(`✅ Secrets injected (api=${apiSecret === 'NEXT-CLASS' ? 'default' : 'custom'}, connection=${connectionSecret === 'NEXT-CLASS' ? 'default' : 'custom'})`);

// 3. update package.json version fields (used by quasar.config.ts and electron-builder)
const buildVersion = `${process.env.VERSION || '0.1.0'}.${process.env.BUILD_NUMBER || '1'}`;
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
packageJson.version = process.env.VERSION || packageJson.version;
packageJson.buildNumber = process.env.BUILD_NUMBER || packageJson.buildNumber;
packageJson.buildVersion = buildVersion;
fs.writeFileSync('./package.json', JSON.stringify(packageJson, null, 2) + '\n');

console.log(`✅ Version ${buildVersion} (${process.env.INFO}), build date ${buildDate}`);
