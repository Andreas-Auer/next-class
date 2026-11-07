/**
 * @license GPL LICENSE
 * Copyright (c) 2021 Thomas Michael Weissel (Next-Exam)
 * Modifications for Next-Class (c) 2026 Andreas Auer
 * GNU General Public License v3 or later - see <http://www.gnu.org/licenses/>
 */
import { createRouter as _createRouter, createWebHashHistory } from 'vue-router'
import startserver from '../pages/startserver.vue'
import dashboard from '../pages/dashboard.vue'
import notfound from '../pages/notfound.vue'
import settings from '../pages/settings.vue'

const routes = [
    { path: '/', name: 'startserver', component: startserver },
    { path: '/dashboard/:servername', name: 'dashboard', component: dashboard },
    { path: '/settings', name: 'settings', component: settings },
    { path: '/:pathMatch(.*)*', component: notfound },
]

export function createRouter() {
    return _createRouter({ history: createWebHashHistory(), routes })
}
export default createRouter
