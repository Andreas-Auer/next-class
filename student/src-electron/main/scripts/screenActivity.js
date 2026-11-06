/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
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
 * Detects how long the screen content has not changed.
 *
 * Small changes are ignored on purpose: the mouse pointer, the taskbar clock, a blinking text cursor
 * and JPEG/scaling noise must not count as activity. Scrolling, typing whole lines, switching
 * windows or playing a video do count.
 *
 * Pure functions + a small tracker class; no Electron imports, so it can be unit-tested with node --test.
 */

/** Default sample size: 160x100 grayscale pixels (16 000 values). */
export const SAMPLE_WIDTH = 160;
export const SAMPLE_HEIGHT = 100;

/** A pixel counts as changed when its brightness differs by more than this (0-255). */
export const PIXEL_THRESHOLD = 24;

/** The frame counts as changed when more than this share of pixels changed (1 %). */
export const CHANGE_RATIO = 0.01;

/** Convert a BGRA bitmap (Electron NativeImage.toBitmap()) into a grayscale Uint8Array. */
export function bgraToGray(bitmap, width, height) {
    const gray = new Uint8Array(width * height);
    for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
        // ITU-R BT.601 luma, integer math: (29*B + 150*G + 77*R) / 256
        gray[i] = (29 * bitmap[p] + 150 * bitmap[p + 1] + 77 * bitmap[p + 2]) >> 8;
    }
    return gray;
}

/** Share of pixels (0..1) whose brightness differs by more than pixelThreshold. */
export function changedRatio(a, b, pixelThreshold = PIXEL_THRESHOLD) {
    if (!a || !b || a.length !== b.length || a.length === 0) return 1;   // incomparable -> treat as changed
    let changed = 0;
    for (let i = 0; i < a.length; i++) {
        if (Math.abs(a[i] - b[i]) > pixelThreshold) changed++;
    }
    return changed / a.length;
}

/** True when two grayscale frames differ significantly (more than the noise/cursor/clock tolerance). */
export function isSignificantChange(a, b, { pixelThreshold = PIXEL_THRESHOLD, changeRatio = CHANGE_RATIO } = {}) {
    return changedRatio(a, b, pixelThreshold) > changeRatio;
}

/**
 * Keeps the last "significantly different" frame and the time since which the screen is unchanged.
 * Compare every new frame with the reference (not just the previous frame), so a slowly creeping
 * change still accumulates and is eventually detected.
 */
export class ScreenActivityTracker {
    constructor(options = {}) {
        this.options = options;
        this.reference = null;
        this.unchangedSince = null;   // ms timestamp, null = unknown (no frame yet / capture not possible)
    }

    /** Feed a new grayscale frame; returns the seconds the screen has been unchanged. */
    addFrame(gray, now = Date.now()) {
        if (!this.reference || isSignificantChange(this.reference, gray, this.options)) {
            this.reference = gray;
            this.unchangedSince = now;
        }
        return this.unchangedSeconds(now);
    }

    /** Capture failed (e.g. missing permission): state becomes unknown. */
    reset() {
        this.reference = null;
        this.unchangedSince = null;
    }

    /** Seconds since the last significant change, or null when unknown. */
    unchangedSeconds(now = Date.now()) {
        return this.unchangedSince === null ? null : Math.max(0, Math.round((now - this.unchangedSince) / 1000));
    }
}
