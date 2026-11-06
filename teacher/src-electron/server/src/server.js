/**
 * @license GPL LICENSE
 * Copyright (c) 2021 Thomas Michael Weissel (Next-Exam)
 * Modifications for Next-Class (c) 2026 Andreas Auer
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU General Public License as published by the Free Software Foundation,
 * either version 3 of the License, or any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License along with this program.
 * If not, see <http://www.gnu.org/licenses/>
 */

/**
 * HTTPS API of the teacher app. Students poll it (heartbeat, live view upload, registration).
 * Self-signed certificate; students pin its fingerprint (announced in the multicast beacon).
 */

import express from 'express';
import https from 'https';
import cors from 'cors';
import ip from 'ip';
import forge from 'node-forge';
import log from 'electron-log';
import { serverRouter } from './routes/serverroutes.js';
import config from '../../main/config.js';
import { gateway4sync } from '../../../../shared/defaultGateway.js';

forge.options.usePureJavaScript = true;

try {
    const { int: iface } = gateway4sync();
    config.hostip = ip.address(iface);   // ip of the interface that owns the default gateway
    config.gateway = true;
} catch {
    log.error('server: unable to determine default gateway');
    config.hostip = ip.address();
    config.gateway = false;
}

const api = express();
api.use(express.json({ limit: '5mb' }));   // live-view screenshots are the largest payload (~150 KB)
api.use(express.urlencoded({ extended: true }));
api.use(cors());

let activeConnections = 0;
api.use((req, res, next) => {
    const startTime = Date.now();
    res.on('finish', () => {
        const duration = Date.now() - startTime;
        if (duration > 5000) log.warn(`server: slow request ${req.method} ${req.url} took ${duration}ms`);
    });
    next();
});
api.use('/server', serverRouter);

const certs = createSelfSignedCert();
config.tlsCertificateFingerprint = certs.fingerprint;

const server = https.createServer({ key: certs.key, cert: certs.cert, requestCert: false, rejectUnauthorized: false }, api);
server.timeout = 30000;
server.keepAliveTimeout = 5000;
server.maxConnections = 200;
server.on('connection', (socket) => {
    activeConnections++;
    if (activeConnections > 150) log.warn(`server: high connection count: ${activeConnections}`);
    socket.on('close', () => { activeConnections--; });
});

export default server;

/** New self-signed certificate per app start; its SHA-256 fingerprint is pinned by the students. */
function createSelfSignedCert() {
    const pki = forge.pki;
    const keys = pki.rsa.generateKeyPair({ bits: 2048 });
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = `01${forge.util.bytesToHex(forge.random.getBytesSync(16))}`;
    cert.validity.notBefore = new Date(Date.now() - 60_000);
    cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const attributes = [{ name: 'commonName', value: 'Next-Class Teacher' }];
    cert.setSubject(attributes);
    cert.setIssuer(attributes);
    cert.setExtensions([{
        name: 'subjectAltName',
        altNames: [{ type: 2, value: 'localhost' }, ...(config.hostip ? [{ type: 7, ip: config.hostip }] : [])],
    }]);
    cert.sign(keys.privateKey, forge.md.sha256.create());
    const der = forge.asn1.toDer(pki.certificateToAsn1(cert)).getBytes();
    return {
        key: pki.privateKeyToPem(keys.privateKey),
        cert: pki.certificateToPem(cert),
        fingerprint: forge.md.sha256.create().update(der).digest().toHex(),
    };
}
