// Unit tests for internet-lock exceptions (license servers, network drives). Run: npm test (in student/)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveExceptions } from '../src-electron/main/scripts/netlock/netExceptions.js';

test('IPs and networks pass, invalid or huge networks are dropped', async () => {
    const out = await resolveExceptions(['10.5.1.20', '10.5.0.0/16', '10.5.0.0/40', '8.0.0.0/4', '999.1.1.1/24', '', '  ']);
    assert.deepEqual(out.sort(), ['10.5.0.0/16', '10.5.1.20/32']);
});

test('host names are resolved to /32 addresses (localhost via the OS resolver)', async () => {
    const out = await resolveExceptions(['localhost']);
    assert.ok(out.includes('127.0.0.1/32'), out.join(','));
});

test('unresolvable host names are skipped without failing', async () => {
    const out = await resolveExceptions(['does-not-exist.invalid', '10.1.1.1']);
    assert.deepEqual(out, ['10.1.1.1/32']);
});
