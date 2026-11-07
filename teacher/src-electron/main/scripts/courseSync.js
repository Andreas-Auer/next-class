/**
 * @license GPL LICENSE
 * Copyright (c) 2026 Andreas Auer (Next-Class, fork of Next-Exam)
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */

/**
 * Keeps the courses of all teachers of a course in sync while their apps run in the same network,
 * also without a lesson together (see shared/courseSync.js). Announces every 15 s and right after
 * a change; fetches newer versions over the pinned HTTPS connection of the teacher apps.
 */

import dgram from 'dgram';
import crypto from 'crypto';
import log from 'electron-log';
import CourseStore, { CourseStore as CourseStoreClass } from './courseStore.js';
import CoTeacherClient from './coTeacherClient.js';
import { getSubnetBroadcast } from './multicastserver.js';
import { buildAnnouncement, parseAnnouncement, coursesToFetch } from '../../../../shared/courseSync.js';

const ANNOUNCE_MS = 15000;
const REFETCH_AFTER_MS = 30000;   // do not ask the same app for the same course again right away

class CourseSync {
    constructor() {
        this.instance = crypto.randomUUID();
        this.socket = null;
        this.fetching = new Map();   // `${ip}:${courseId}` -> ms
        this.changeTimer = null;
    }

    init(config) {
        this.config = config;
        if (process.env.NEXT_CLASS_COURSE_SYNC === '0') return;
        try {
            this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
            this.socket.on('error', (e) => log.warn(`courseSync @ socket: ${e.message}`));
            this.socket.bind(0, () => {
                try { this.socket.setBroadcast(true); this.socket.setMulticastTTL(8); } catch { /* default */ }
                try { if (config.hostip) this.socket.setMulticastInterface(config.hostip); } catch { /* default route */ }
            });
        } catch (e) {
            log.warn(`courseSync @ init: ${e.message}`);
            return;
        }
        setInterval(() => this.announce(), ANNOUNCE_MS);
        setTimeout(() => this.announce(), 3000);
        CourseStore.onChange = () => {   // a change goes out within a second
            clearTimeout(this.changeTimer);
            this.changeTimer = setTimeout(() => this.announce(), 1000);
        };
    }

    announce() {
        if (!this.socket || !this.config.hostip) return;
        const courses = CourseStore.load().courses;
        if (!courses.length) return;
        const msg = Buffer.from(JSON.stringify(buildAnnouncement(courses, { instance: this.instance, apiPort: this.config.serverApiPort })));
        const done = (e) => { if (e) log.warn(`courseSync @ announce: ${e.message}`); };
        this.socket.send(msg, 0, msg.length, this.config.multicastServerClientPort, this.config.multicastServerAdrr, done);
        // also as subnet broadcast, like the lesson beacons: school networks often swallow multicast
        const broadcast = getSubnetBroadcast(this.config.hostip);
        if (broadcast) this.socket.send(msg, 0, msg.length, this.config.multicastServerClientPort, broadcast, done);
    }

    /** Called by the multicast client for every packet; returns true if it was a course announcement. */
    onPacket(text, rinfo) {
        const a = parseAnnouncement(text);
        if (!a) return false;
        if (a.instance === this.instance) return true;
        for (const course of coursesToFetch(CourseStore.load().courses, a)) this.fetch(course, rinfo.address, a.apiPort);
        return true;
    }

    async fetch(course, host, port) {
        const key = `${host}:${port}:${course.id}`;
        if (Date.now() - (this.fetching.get(key) || 0) < REFETCH_AFTER_MS) return;
        this.fetching.set(key, Date.now());
        try {
            const nonce = crypto.randomUUID();
            const r = await CoTeacherClient.request({ host, port }, '/server/teacher/coursesync', {
                body: { courseId: course.id, nonce, proof: CourseStoreClass.proof(course.secret, nonce) },
            });
            if (r?.status !== 'success' || r.course?.id !== course.id || r.course.secret !== course.secret) return;
            if (CourseStore.merge(r.course)) log.info(`courseSync: course "${r.course.name}" updated from ${host}`);
        } catch (e) {
            log.warn(`courseSync @ fetch from ${host}: ${e.message}`);
        }
    }
}

export default new CourseSync();
