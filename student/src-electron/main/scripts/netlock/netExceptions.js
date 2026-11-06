/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

import dns from 'dns';
import net from 'net';
import log from 'electron-log';

const RESOLVE_CACHE_MS = 60 * 1000;          // host names of exceptions (license servers) are resolved at most once a minute
const resolveCache = new Map();              // host -> { at, ips }

/**
 * Teacher exceptions: "10.5.0.0/16", "10.5.1.20" or a host name like "license.example.com".
 * Host names are resolved to their current IPv4 addresses (via the OS resolver, so the hosts file and
 * the school DNS count). Cloud services with many changing addresses cannot be covered reliably.
 */
export async function resolveExceptions(entries = []) {
    const out = new Set();
    for (const raw of entries || []) {
        const e = String(raw || '').trim();
        if (!e) continue;
        if (net.isIPv4(e)) { out.add(`${e}/32`); continue; }
        const cidr = /^(\d+\.\d+\.\d+\.\d+)\/(\d+)$/.exec(e);
        if (cidr) {
            // the helper rejects invalid or huge networks - one bad entry must not break the whole lock
            if (net.isIPv4(cidr[1]) && Number(cidr[2]) >= 8 && Number(cidr[2]) <= 32) out.add(e);
            else log.warn(`netlock: ignored invalid exception ${e}`);
            continue;
        }
        if (!/^[a-z0-9.-]+$/i.test(e)) continue;
        const cached = resolveCache.get(e);
        if (cached && Date.now() - cached.at < RESOLVE_CACHE_MS) { cached.ips.forEach((ip) => out.add(`${ip}/32`)); continue; }
        try {
            const res = await dns.promises.lookup(e, { all: true, family: 4 });
            const ips = res.map((r) => r.address);
            resolveCache.set(e, { at: Date.now(), ips });
            ips.forEach((ip) => out.add(`${ip}/32`));
        } catch (err) {
            if (cached) cached.ips.forEach((ip) => out.add(`${ip}/32`));   // keep the last known addresses
            log.warn(`netlock: could not resolve exception ${e}: ${err.code || err.message}`);
        }
    }
    return [...out];
}
