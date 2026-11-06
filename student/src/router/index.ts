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

import { defineRouter } from '#q-app/wrappers'
import { createRouter, createWebHashHistory } from 'vue-router'
import student from '../pages/student.vue'

const lock = () => import('../pages/lock.vue')
const notfound = () => import('../pages/notfound.vue')

const routes = [
    { path: '/', name: 'index', component: student },
    { path: '/student', name: 'student', component: student },
    { path: '/lock', name: 'lock', component: lock },
    { path: '/:pathMatch(.*)*', name: '404', component: notfound },
]

export default defineRouter(function () {
    return createRouter({ history: createWebHashHistory(), routes })
})
