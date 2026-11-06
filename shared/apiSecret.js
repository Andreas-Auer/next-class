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
 * Shared secrets for Teacher <-> Student communication.
 * Both values are written by teacher/scripts/prebuild.js and student/scripts/prebuild.js from .env
 * (placeholder "NEXT-CLASS"; CI may inject real values). They must be identical in both apps.
 *
 * Note: these secrets ship inside the binaries, so they only keep out casual clients.
 * Real access control is the session PIN and the per-student token.
 */

export const API_SECRET = 'NEXT-CLASS';
export const CONNECTION_SECRET = 'NEXT-CLASS';

/** Timestamp (ms) header; used together with the HMAC to bound replay to a time window. */
export const API_TS_HEADER = 'x-next-class-app-ts';

/** HMAC-SHA256(secret, ts) as base64; proves secret knowledge without exposing it. */
export const API_MAC_HEADER = 'x-next-class-app-mac';

/** Max clock skew (ms) the teacher accepts between its clock and the request timestamp. */
export const API_TS_WINDOW_MS = 300000;

const enc = new TextEncoder();

/** HMAC-SHA256(secret, message) -> base64 string. Works in Node (global crypto.subtle) and browser. */
export async function computeAppMac(message) {
    const key = await crypto.subtle.importKey('raw', enc.encode(API_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(String(message)));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

/** Builds the {ts, mac} auth headers for a /server/* request. */
export async function buildAppSecretHeaders() {
    const ts = String(Date.now());
    const mac = await computeAppMac(ts);
    return { [API_TS_HEADER]: ts, [API_MAC_HEADER]: mac };
}

/** AES-GCM key derived from the session PIN + connection secret (used for the registration packet). */
async function sessionKey(sessionRef, usage) {
    const raw = enc.encode((String(sessionRef) + CONNECTION_SECRET + '0').padEnd(32, '0').slice(0, 32));
    return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, [usage]);
}

/** Encrypt a JSON payload with a key derived from the session PIN. */
export async function encryptSessionPayload(data, sessionRef) {
    const key = await sessionKey(sessionRef, 'encrypt');
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)));
    return {
        v: btoa(String.fromCharCode(...iv)),
        d: btoa(String.fromCharCode(...new Uint8Array(buf))),
    };
}

/** Decrypt a packet produced by encryptSessionPayload; throws if the PIN does not match. */
export async function decryptSessionPayload(packet, sessionRef) {
    const key = await sessionKey(sessionRef, 'decrypt');
    const iv = Uint8Array.from(atob(packet.v), (c) => c.charCodeAt(0));
    const buf = Uint8Array.from(atob(packet.d), (c) => c.charCodeAt(0));
    const res = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, buf);
    return JSON.parse(new TextDecoder().decode(res));
}
