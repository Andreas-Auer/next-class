// Unit tests for the screen inactivity detection. Run: npm test (in student/) or node --test student/tests
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    SAMPLE_WIDTH as W, SAMPLE_HEIGHT as H,
    bgraToGray, changedRatio, isSignificantChange, ScreenActivityTracker,
} from '../src-electron/main/scripts/screenActivity.js';

/** A "desktop": light background with a few dark text-like bars. */
function desktop() {
    const g = new Uint8Array(W * H).fill(230);
    for (let y = 10; y < 90; y += 8) for (let x = 10; x < 140; x++) g[y * W + x] = 40;
    return g;
}

function drawRect(g, x0, y0, w, h, value) {
    const out = Uint8Array.from(g);
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) out[y * W + x] = value;
    return out;
}

test('identical frames are unchanged', () => {
    const a = desktop();
    assert.equal(changedRatio(a, Uint8Array.from(a)), 0);
    assert.equal(isSignificantChange(a, Uint8Array.from(a)), false);
});

test('mouse pointer moved (a few pixels) is ignored', () => {
    const a = drawRect(desktop(), 50, 50, 3, 4, 0);   // ~32px cursor on a 1920px screen is ~3px at 160px width
    const b = drawRect(desktop(), 90, 20, 3, 4, 0);
    assert.equal(isSignificantChange(a, b), false);
});

test('taskbar clock change is ignored', () => {
    const a = drawRect(desktop(), 140, 95, 16, 4, 20);
    const b = drawRect(desktop(), 140, 95, 16, 4, 200);
    assert.equal(isSignificantChange(a, b), false);
});

test('compression noise (small brightness jitter everywhere) is ignored', () => {
    const a = desktop();
    const b = a.map((v, i) => Math.max(0, Math.min(255, v + ((i * 7919) % 21) - 10)));   // +-10
    assert.equal(isSignificantChange(a, b), false);
});

test('scrolling / new content is a significant change', () => {
    const a = desktop();
    const b = new Uint8Array(W * H).fill(230);
    for (let y = 14; y < 94; y += 8) for (let x = 10; x < 140; x++) b[y * W + x] = 40;   // text moved by 4 rows
    assert.equal(isSignificantChange(a, b), true);
});

test('switching to another window is a significant change', () => {
    assert.equal(isSignificantChange(desktop(), drawRect(desktop(), 20, 20, 120, 60, 90)), true);
});

test('tracker counts unchanged time and resets on change', () => {
    const t = new ScreenActivityTracker();
    const start = 1_000_000;
    assert.equal(t.addFrame(desktop(), start), 0);
    assert.equal(t.addFrame(drawRect(desktop(), 60, 60, 3, 4, 0), start + 60_000), 60);   // only the cursor moved
    assert.equal(t.addFrame(desktop(), start + 130_000), 130);
    assert.equal(t.addFrame(drawRect(desktop(), 20, 20, 120, 60, 90), start + 140_000), 0);   // real change
    assert.equal(t.unchangedSeconds(start + 150_000), 10);
});

test('slow creeping changes accumulate against the reference frame', () => {
    const t = new ScreenActivityTracker();
    const start = 0;
    let frame = desktop();
    t.addFrame(frame, start);
    // each step changes ~0.6 % of pixels (below the threshold alone); after a few steps the total exceeds 1 %
    let reset = false;
    for (let step = 1; step <= 5 && !reset; step++) {
        frame = drawRect(frame, 10 + step * 10, 2, 10, 10, 0);
        reset = t.addFrame(frame, start + step * 10_000) === 0;
    }
    assert.equal(reset, true);
});

test('reset makes the state unknown', () => {
    const t = new ScreenActivityTracker();
    t.addFrame(desktop(), 0);
    t.reset();
    assert.equal(t.unchangedSeconds(10_000), null);
});

test('bgraToGray converts white, black and pure colors', () => {
    const bgra = Uint8Array.from([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 255, 255]);   // white, black, red
    const gray = bgraToGray(bgra, 3, 1);
    assert.ok(gray[0] >= 253);
    assert.equal(gray[1], 0);
    assert.ok(gray[2] > 60 && gray[2] < 90);
});
