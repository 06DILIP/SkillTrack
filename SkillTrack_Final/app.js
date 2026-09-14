/* =====================================================
   SKILLTRACK — bundled app script.
   Combines utils, storage, auth, state, charts, ui, and
   main (in that dependency order) into one file. Each
   section still runs in its own IIFE and only talks to
   the others through the shared `ST` namespace object —
   splitting them back into separate files later is just
   a matter of copy-pasting each block back out.
===================================================== */


/* ============ utils.js ============ */
(function () {
"use strict";

/* =====================================================
   UTILS — small, dependency-free helpers shared by
   every module. Nothing in here touches the DOM.
===================================================== */

// Escape any user-supplied string before it goes into innerHTML.
// This is the single most important line in the whole app: every
// render function below routes text through this first.
function esc(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
    }[c]));
}

// Collision-resistant enough for a client-only app.
function uid() {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function todayKey(date = new Date()) {
    return date.toISOString().slice(0, 10); // YYYY-MM-DD
}

function daysAgoKey(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return todayKey(d);
}

function clamp(n, min, max) {
    return Math.min(max, Math.max(min, Number.isFinite(n) ? n : min));
}

function debounce(fn, wait = 200) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

function formatDate(key) {
    const d = new Date(`${key}T00:00:00`);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Base64url-safe encode/decode for exporting small JSON blobs.
function toBase64(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
}

function fromBase64(str) {
    return JSON.parse(decodeURIComponent(escape(atob(str))));
}

window.ST = window.ST || {};
ST.utils = { esc, uid, todayKey, daysAgoKey, clamp, debounce, formatDate, toBase64, fromBase64 };

})();


/* ============ storage.js ============ */
(function () {
"use strict";

/* =====================================================
   STORAGE — the only module that talks to localStorage.
   Everything else goes through here, so the storage
   format can change in one place if it ever needs to.
===================================================== */

const KEYS = {
    users: "st_users",          // array of user records (no plaintext passwords)
    session: "st_session",      // { username, expiresAt } — persisted login
    dataPrefix: "st_data__",    // st_data__<username> -> that user's app data
    themeGlobal: "st_theme",    // fallback theme before login
};

const Storage = {
    /* ---------- users ---------- */
    getUsers() {
        try {
            return JSON.parse(localStorage.getItem(KEYS.users)) || [];
        } catch {
            return [];
        }
    },

    saveUsers(users) {
        localStorage.setItem(KEYS.users, JSON.stringify(users));
    },

    findUser(username) {
        const lower = username.trim().toLowerCase();
        return this.getUsers().find((u) => u.username.toLowerCase() === lower) || null;
    },

    upsertUser(record) {
        const users = this.getUsers();
        const idx = users.findIndex((u) => u.username.toLowerCase() === record.username.toLowerCase());
        if (idx === -1) users.push(record);
        else users[idx] = record;
        this.saveUsers(users);
    },

    deleteUser(username) {
        const users = this.getUsers().filter((u) => u.username.toLowerCase() !== username.toLowerCase());
        this.saveUsers(users);
        localStorage.removeItem(KEYS.dataPrefix + username.toLowerCase());
    },

    /* ---------- session ---------- */
    getSession() {
        try {
            const s = JSON.parse(localStorage.getItem(KEYS.session));
            if (s && (!s.expiresAt || s.expiresAt > Date.now())) return s;
        } catch {
            /* fall through */
        }
        return null;
    },

    setSession(username, remember) {
        const expiresAt = remember ? Date.now() + 1000 * 60 * 60 * 24 * 30 : Date.now() + 1000 * 60 * 60 * 12;
        localStorage.setItem(KEYS.session, JSON.stringify({ username: username.toLowerCase(), expiresAt }));
    },

    clearSession() {
        localStorage.removeItem(KEYS.session);
    },

    /* ---------- per-user app data ---------- */
    getUserData(username) {
        const raw = localStorage.getItem(KEYS.dataPrefix + username.toLowerCase());
        return raw ? JSON.parse(raw) : null;
    },

    saveUserData(username, data) {
        localStorage.setItem(KEYS.dataPrefix + username.toLowerCase(), JSON.stringify(data));
    },

    /* ---------- theme (kept outside per-user data so the login screen can use it) ---------- */
    getGlobalTheme() {
        return localStorage.getItem(KEYS.themeGlobal) || "dark";
    },

    setGlobalTheme(theme) {
        localStorage.setItem(KEYS.themeGlobal, theme);
    },
};

function defaultUserData(displayName) {
    return {
        displayName,
        theme: Storage.getGlobalTheme(),
        xp: 0,
        activity: {},          // { "YYYY-MM-DD": count }
        unlockedBadges: [],
        skills: [
            { id: "s1", name: "HTML & CSS", progress: 90, category: "Frontend" },
            { id: "s2", name: "JavaScript", progress: 80, category: "Frontend" },
            { id: "s3", name: "DSA", progress: 65, category: "Problem Solving" },
            { id: "s4", name: "React", progress: 40, category: "Frontend" },
            { id: "s5", name: "Node.js", progress: 15, category: "Backend" },
        ],
        problems: [
            { id: "p1", title: "Two Sum", topic: "Arrays", difficulty: "Easy", status: "Solved" },
            { id: "p2", title: "Longest Substring Without Repeating Characters", topic: "Strings", difficulty: "Medium", status: "Attempted" },
            { id: "p3", title: "Binary Search", topic: "Searching", difficulty: "Easy", status: "Solved" },
            { id: "p4", title: "Merge Sorted Array", topic: "Arrays", difficulty: "Easy", status: "Solved" },
            { id: "p5", title: "Recursive Sum", topic: "Recursion", difficulty: "Easy", status: "Todo" },
        ],
        projects: [
            { id: "pr1", name: "Tic Tac Toe", description: "Interactive two-player browser game.", tech: "HTML, CSS, JavaScript", progress: 100, status: "Completed" },
            { id: "pr2", name: "Expense Tracker", description: "Track income, expenses and spending categories.", tech: "HTML, CSS, JavaScript", progress: 55, status: "In Progress" },
            { id: "pr3", name: "SkillTrack", description: "Developer growth and learning dashboard.", tech: "HTML, CSS, JavaScript", progress: 80, status: "Building" },
        ],
        goals: [
            { id: "g1", text: "Solve 3 DSA problems", done: false },
            { id: "g2", text: "Practice JavaScript for 45 minutes", done: true },
            { id: "g3", text: "Learn one React concept", done: false },
        ],
    };
}

window.ST = window.ST || {};
ST.Storage = Storage;
ST.defaultUserData = defaultUserData;

})();


/* ============ auth.js ============ */
(function () {
"use strict";

/* =====================================================
   AUTH — signup / login / logout / password reset.

   IMPORTANT CONTEXT FOR WHOEVER MAINTAINS THIS:
   This is a static, no-backend app, so "auth" here means
   accounts stored in the browser's localStorage, not a
   real identity system. Passwords are never stored in
   plaintext (salted + PBKDF2 hashed via SubtleCrypto),
   but anyone with devtools access to *this browser
   profile* can still inspect localStorage. Treat this as
   a genuine multi-profile UX layer (so several people can
   share one machine with separate dashboards), not as a
   security boundary. If this app ever gets a real server,
   swap this module for real auth and keep everything else.
===================================================== */

const { Storage } = ST;
const PBKDF2_ITERATIONS = 150_000;

function randomSalt() {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    return btoa(String.fromCharCode(...bytes));
}

async function hashPassword(password, saltB64) {
    const enc = new TextEncoder();
    const saltBytes = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
    const keyMaterial = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: saltBytes, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        keyMaterial,
        256
    );
    return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

const Auth = {
    validateUsername(username) {
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            return "Username must be 3–20 characters: letters, numbers, underscore.";
        }
        return null;
    },

    validatePassword(password) {
        if (password.length < 8) return "Password must be at least 8 characters.";
        return null;
    },

    async signup({ username, password, displayName, securityQuestion, securityAnswer }) {
        username = username.trim();
        const usernameError = this.validateUsername(username);
        if (usernameError) throw new Error(usernameError);

        const passwordError = this.validatePassword(password);
        if (passwordError) throw new Error(passwordError);

        if (Storage.findUser(username)) throw new Error("That username is already taken.");

        const salt = randomSalt();
        const hash = await hashPassword(password, salt);

        Storage.upsertUser({
            username,
            displayName: displayName.trim() || username,
            salt,
            hash,
            securityQuestion: securityQuestion || "",
            securityAnswerHash: securityAnswer ? await hashPassword(securityAnswer.trim().toLowerCase(), salt) : null,
            createdAt: Date.now(),
        });

        return username;
    },

    async login({ username, password, remember }) {
        const user = Storage.findUser(username.trim());
        if (!user) throw new Error("No account with that username.");

        const attemptHash = await hashPassword(password, user.salt);
        if (attemptHash !== user.hash) throw new Error("Incorrect password.");

        Storage.setSession(user.username, remember);
        return user;
    },

    logout() {
        Storage.clearSession();
    },

    currentUser() {
        const session = Storage.getSession();
        if (!session) return null;
        return Storage.findUser(session.username);
    },

    async changePassword(username, currentPassword, newPassword) {
        const user = Storage.findUser(username);
        if (!user) throw new Error("Account not found.");

        const attemptHash = await hashPassword(currentPassword, user.salt);
        if (attemptHash !== user.hash) throw new Error("Current password is incorrect.");

        const passwordError = this.validatePassword(newPassword);
        if (passwordError) throw new Error(passwordError);

        user.hash = await hashPassword(newPassword, user.salt);
        Storage.upsertUser(user);
    },

    async resetPassword(username, securityAnswer, newPassword) {
        const user = Storage.findUser(username);
        if (!user || !user.securityAnswerHash) throw new Error("No recovery info on file for that account.");

        const attemptHash = await hashPassword(securityAnswer.trim().toLowerCase(), user.salt);
        if (attemptHash !== user.securityAnswerHash) throw new Error("That answer doesn't match our records.");

        const passwordError = this.validatePassword(newPassword);
        if (passwordError) throw new Error(passwordError);

        user.hash = await hashPassword(newPassword, user.salt);
        Storage.upsertUser(user);
    },
};

window.ST = window.ST || {};
ST.Auth = Auth;

})();


/* ============ state.js ============ */
(function () {
"use strict";

/* =====================================================
   STATE — one user's dashboard data, plus every derived
   number the UI needs (XP, level, streak, badges...).
   Pure logic, no DOM access, so it's easy to reason about.
===================================================== */

const { Storage, defaultUserData } = ST;
const { uid, todayKey, daysAgoKey, clamp } = ST.utils;
const XP_TABLE = { Easy: 10, Medium: 20, Hard: 35, goal: 5, project: 60 };

const LEETCODE_PROBLEMS = [
    ["Two Sum", "Arrays", "Easy", "two-sum"],
    ["Valid Parentheses", "Stack", "Easy", "valid-parentheses"],
    ["Merge Two Sorted Lists", "Linked List", "Easy", "merge-two-sorted-lists"],
    ["Best Time to Buy and Sell Stock", "Arrays", "Easy", "best-time-to-buy-and-sell-stock"],
    ["Valid Palindrome", "Two Pointers", "Easy", "valid-palindrome"],
    ["Invert Binary Tree", "Trees", "Easy", "invert-binary-tree"],
    ["Valid Anagram", "Hash Table", "Easy", "valid-anagram"],
    ["Binary Search", "Binary Search", "Easy", "binary-search"],
    ["Flood Fill", "Graphs", "Easy", "flood-fill"],
    ["Lowest Common Ancestor of a Binary Search Tree", "Trees", "Easy", "lowest-common-ancestor-of-a-binary-search-tree"],
    ["Balanced Binary Tree", "Trees", "Easy", "balanced-binary-tree"],
    ["Linked List Cycle", "Linked List", "Easy", "linked-list-cycle"],
    ["Maximum Depth of Binary Tree", "Trees", "Easy", "maximum-depth-of-binary-tree"],
    ["Majority Element", "Arrays", "Easy", "majority-element"],
    ["Climbing Stairs", "Dynamic Programming", "Easy", "climbing-stairs"],
    ["Reverse Linked List", "Linked List", "Easy", "reverse-linked-list"],
    ["Contains Duplicate", "Arrays", "Easy", "contains-duplicate"],
    ["Single Number", "Bit Manipulation", "Easy", "single-number"],
    ["Palindrome Linked List", "Linked List", "Easy", "palindrome-linked-list"],
    ["Move Zeroes", "Arrays", "Easy", "move-zeroes"],
    ["Middle of the Linked List", "Linked List", "Easy", "middle-of-the-linked-list"],
    ["Maximum Subarray", "Arrays", "Medium", "maximum-subarray"],
    ["Longest Substring Without Repeating Characters", "Strings", "Medium", "longest-substring-without-repeating-characters"],
    ["3Sum", "Two Pointers", "Medium", "3sum"],
    ["Container With Most Water", "Two Pointers", "Medium", "container-with-most-water"],
    ["Group Anagrams", "Hash Table", "Medium", "group-anagrams"],
    ["Product of Array Except Self", "Arrays", "Medium", "product-of-array-except-self"],
    ["Top K Frequent Elements", "Hash Table", "Medium", "top-k-frequent-elements"],
    ["Longest Palindromic Substring", "Strings", "Medium", "longest-palindromic-substring"],
    ["Search in Rotated Sorted Array", "Binary Search", "Medium", "search-in-rotated-sorted-array"],
    ["Find Minimum in Rotated Sorted Array", "Binary Search", "Medium", "find-minimum-in-rotated-sorted-array"],
    ["Valid Sudoku", "Matrix", "Medium", "valid-sudoku"],
    ["Number of Islands", "Graphs", "Medium", "number-of-islands"],
    ["Rotate Image", "Matrix", "Medium", "rotate-image"],
    ["Coin Change", "Dynamic Programming", "Medium", "coin-change"],
    ["House Robber", "Dynamic Programming", "Medium", "house-robber"],
    ["Binary Tree Level Order Traversal", "Trees", "Medium", "binary-tree-level-order-traversal"],
    ["Kth Smallest Element in a BST", "Trees", "Medium", "kth-smallest-element-in-a-bst"],
    ["Course Schedule", "Graphs", "Medium", "course-schedule"],
    ["Longest Consecutive Sequence", "Hash Table", "Medium", "longest-consecutive-sequence"],
    ["Word Break", "Dynamic Programming", "Medium", "word-break"],
    ["Combination Sum", "Backtracking", "Medium", "combination-sum"],
    ["Permutations", "Backtracking", "Medium", "permutations"],
    ["Merge Intervals", "Intervals", "Medium", "merge-intervals"],
    ["Set Matrix Zeroes", "Matrix", "Medium", "set-matrix-zeroes"],
    ["LRU Cache", "Design", "Medium", "lru-cache"],
    ["Trapping Rain Water", "Two Pointers", "Hard", "trapping-rain-water"],
    ["Median of Two Sorted Arrays", "Binary Search", "Hard", "median-of-two-sorted-arrays"],
    ["Merge k Sorted Lists", "Linked List", "Hard", "merge-k-sorted-lists"],
    ["Word Ladder", "Graphs", "Hard", "word-ladder"],
];

function createLeetCodeProblems() {
    return LEETCODE_PROBLEMS.map(([title, topic, difficulty, slug], index) => ({
        id: `lc-${String(index + 1).padStart(2, "0")}`,
        title,
        topic,
        difficulty,
        status: "Todo",
        source: "LeetCode",
        url: `https://leetcode.com/problems/${slug}/`,
    }));
}

function ensureLeetCodeProblems(data) {
    const existing = new Set(data.problems.map((p) => p.id));
    const missing = createLeetCodeProblems().filter((problem) => !existing.has(problem.id));

    // Give each account a random starting order while keeping stable IDs/statuses.
    for (let i = missing.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [missing[i], missing[j]] = [missing[j], missing[i]];
    }

    data.problems.push(...missing);
}

const BADGES = [
    { id: "first_solve", label: "First Blood", desc: "Solve your first problem", icon: "🩸" },
    { id: "ten_solve", label: "Grinder", desc: "Solve 10 problems", icon: "⚙️" },
    { id: "streak3", label: "Warming Up", desc: "3-day activity streak", icon: "🔥" },
    { id: "streak7", label: "On a Roll", desc: "7-day activity streak", icon: "🚀" },
    { id: "project_done", label: "Shipped It", desc: "Complete a project", icon: "📦" },
    { id: "skill_master", label: "Specialist", desc: "Get a skill to 100%", icon: "🏆" },
];

class AppState {
    constructor(username) {
        this.username = username;
        this.data = Storage.getUserData(username) || defaultUserData(username);
        if (!Array.isArray(this.data.problems)) this.data.problems = [];
        ensureLeetCodeProblems(this.data);
        this.save();
    }

    save() {
        Storage.saveUserData(this.username, this.data);
    }

    /* ---------- activity / XP / streak ---------- */

    addXp(amount) {
        this.data.xp = Math.max(0, (this.data.xp || 0) + amount);
    }

    recordActivity(count = 1) {
        const key = todayKey();
        this.data.activity[key] = (this.data.activity[key] || 0) + count;
    }

    get level() {
        // Gentle curve: level up roughly every 100, 250, 450... xp.
        return 1 + Math.floor(Math.sqrt((this.data.xp || 0) / 40));
    }

    get xpIntoLevel() {
        const base = 40 * (this.level - 1) ** 2;
        const next = 40 * this.level ** 2;
        return { current: (this.data.xp || 0) - base, span: next - base };
    }

    get streak() {
        let streak = 0;
        for (let i = 0; ; i++) {
            const key = daysAgoKey(i);
            if (this.data.activity[key]) streak++;
            else break;
        }
        return streak;
    }

    get weeklyActivity() {
        const days = [];
        for (let i = 6; i >= 0; i--) {
            const key = daysAgoKey(i);
            days.push({ key, count: this.data.activity[key] || 0 });
        }
        return days;
    }

    checkBadges() {
        const solved = this.data.problems.filter((p) => p.status === "Solved").length;
        const newly = [];
        const unlock = (id) => {
            if (!this.data.unlockedBadges.includes(id)) {
                this.data.unlockedBadges.push(id);
                newly.push(BADGES.find((b) => b.id === id));
            }
        };
        if (solved >= 1) unlock("first_solve");
        if (solved >= 10) unlock("ten_solve");
        if (this.streak >= 3) unlock("streak3");
        if (this.streak >= 7) unlock("streak7");
        if (this.data.projects.some((p) => p.status === "Completed")) unlock("project_done");
        if (this.data.skills.some((s) => s.progress >= 100)) unlock("skill_master");
        return newly;
    }

    /* ---------- skills ---------- */

    addSkill({ name, category, progress }) {
        this.data.skills.push({ id: uid(), name, category, progress: clamp(progress, 0, 100) });
        this.save();
    }

    updateSkill(id, patch) {
        const skill = this.data.skills.find((s) => s.id === id);
        if (!skill) return;
        Object.assign(skill, patch, { progress: clamp(patch.progress ?? skill.progress, 0, 100) });
        this.save();
    }

    deleteSkill(id) {
        this.data.skills = this.data.skills.filter((s) => s.id !== id);
        this.save();
    }

    /* ---------- problems ---------- */

    addProblem({ title, topic, difficulty, status }) {
        this.data.problems.push({ id: uid(), title, topic, difficulty, status });
        if (status === "Solved") {
            this.addXp(XP_TABLE[difficulty] || 10);
            this.recordActivity();
        }
        this.save();
    }

    updateProblemStatus(id, status) {
        const problem = this.data.problems.find((p) => p.id === id);
        if (!problem) return;
        const wasSolved = problem.status === "Solved";
        problem.status = status;
        if (status === "Solved" && !wasSolved) {
            this.addXp(XP_TABLE[problem.difficulty] || 10);
            this.recordActivity();
        }
        this.save();
    }

    deleteProblem(id) {
        this.data.problems = this.data.problems.filter((p) => p.id !== id);
        this.save();
    }

    /* ---------- projects ---------- */

    addProject(project) {
        this.data.projects.push({ id: uid(), ...project });
        if (project.status === "Completed") this.addXp(XP_TABLE.project);
        this.save();
    }

    updateProject(id, patch) {
        const project = this.data.projects.find((p) => p.id === id);
        if (!project) return;
        const wasCompleted = project.status === "Completed";
        Object.assign(project, patch);
        if (project.status === "Completed" && !wasCompleted) this.addXp(XP_TABLE.project);
        this.save();
    }

    deleteProject(id) {
        this.data.projects = this.data.projects.filter((p) => p.id !== id);
        this.save();
    }

    /* ---------- goals ---------- */

    addGoal(text) {
        this.data.goals.push({ id: uid(), text, done: false });
        this.save();
    }

    toggleGoal(id) {
        const goal = this.data.goals.find((g) => g.id === id);
        if (!goal) return;
        goal.done = !goal.done;
        if (goal.done) {
            this.addXp(XP_TABLE.goal);
            this.recordActivity();
        }
        this.save();
    }

    deleteGoal(id) {
        this.data.goals = this.data.goals.filter((g) => g.id !== id);
        this.save();
    }

    /* ---------- computed dashboard stats ---------- */

    get overallSkillProgress() {
        if (!this.data.skills.length) return 0;
        return Math.round(this.data.skills.reduce((sum, s) => sum + s.progress, 0) / this.data.skills.length);
    }

    get weakestSkill() {
        if (!this.data.skills.length) return null;
        return this.data.skills.reduce((min, s) => (s.progress < min.progress ? s : min), this.data.skills[0]);
    }

    get goalCompletion() {
        const total = this.data.goals.length;
        const done = this.data.goals.filter((g) => g.done).length;
        return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
    }
}

window.ST = window.ST || {};
ST.BADGES = BADGES;
ST.LEETCODE_PROBLEMS = LEETCODE_PROBLEMS;
ST.createLeetCodeProblems = createLeetCodeProblems;
ST.ensureLeetCodeProblems = ensureLeetCodeProblems;
ST.AppState = AppState;

})();


/* ============ charts.js ============ */
(function () {
"use strict";

const { esc, formatDate } = ST.utils;

/* =====================================================
   CHARTS — a couple of tiny inline-SVG renderers.
   No charting library; the visuals here are simple
   enough that hand-rolled SVG is clearer and lighter.
===================================================== */

// A ring showing a single percentage (used for the goals-complete ring).
function donutSvg(pct, { size = 120, stroke = 12 } = {}) {
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (pct / 100) * c;
    return `
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="donut">
            <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="donut-track" stroke-width="${stroke}" fill="none" />
            <circle cx="${size / 2}" cy="${size / 2}" r="${r}" class="donut-value" stroke-width="${stroke}" fill="none"
                stroke-dasharray="${c}" stroke-dashoffset="${offset}"
                transform="rotate(-90 ${size / 2} ${size / 2})" stroke-linecap="round" />
        </svg>
    `;
}

// A 7-bar weekly activity chart. `days` is [{ key, count }].
function weeklyBarChart(days) {
    const max = Math.max(1, ...days.map((d) => d.count));
    const barW = 28;
    const gap = 14;
    const chartH = 80;
    const width = days.length * (barW + gap);
    const bars = days
        .map((d, i) => {
            const h = Math.round((d.count / max) * chartH) || 2;
            const x = i * (barW + gap);
            const y = chartH - h;
            return `
                <g class="activity-bar-group">
                    <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" class="activity-bar${d.count ? " has-activity" : ""}" />
                    <text x="${x + barW / 2}" y="${chartH + 18}" class="activity-label" text-anchor="middle">${esc(formatDate(d.key).split(" ")[1] || "")}</text>
                    ${d.count ? `<text x="${x + barW / 2}" y="${y - 6}" class="activity-count" text-anchor="middle">${d.count}</text>` : ""}
                </g>
            `;
        })
        .join("");
    return `<svg viewBox="0 0 ${width} ${chartH + 30}" class="weekly-chart" preserveAspectRatio="xMidYMid meet">${bars}</svg>`;
}

window.ST = window.ST || {};
ST.charts = { donutSvg, weeklyBarChart };

})();


/* ============ ui.js ============ */
(function () {
"use strict";

/* =====================================================
   UI — every function that touches the DOM lives here.
   Rendering is "dumb": given state, produce markup. All
   user text is routed through esc() before interpolation.
===================================================== */

const { esc } = ST.utils;
const { donutSvg, weeklyBarChart } = ST.charts;
const { BADGES } = ST;
const $ = (id) => document.getElementById(id);

/* ---------------------------- toast ---------------------------- */

let toastTimer = null;
function showToast(message, type = "success") {
    const toast = $("toast");
    toast.textContent = message;
    toast.className = `toast show toast-${type}`;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

/* ------------------------- confirm dialog ------------------------ */

function confirmDialog({ title, message, confirmLabel = "Delete", danger = true }) {
    return new Promise((resolve) => {
        const overlay = $("confirmOverlay");
        $("confirmTitle").textContent = title;
        $("confirmMessage").textContent = message;
        const okBtn = $("confirmOk");
        okBtn.textContent = confirmLabel;
        okBtn.className = `modal-submit${danger ? " danger" : ""}`;
        overlay.classList.add("show");

        const cleanup = (result) => {
            overlay.classList.remove("show");
            okBtn.removeEventListener("click", onOk);
            $("confirmCancel").removeEventListener("click", onCancel);
            resolve(result);
        };
        const onOk = () => cleanup(true);
        const onCancel = () => cleanup(false);
        okBtn.addEventListener("click", onOk);
        $("confirmCancel").addEventListener("click", onCancel);
    });
}

/* ----------------------------- modal ----------------------------- */

function openModal(title, formHtml) {
    $("modalTitle").textContent = title;
    $("modalForm").innerHTML = formHtml;
    $("modal").classList.add("show");
    const firstField = $("modalForm").querySelector("input, select, textarea");
    if (firstField) setTimeout(() => firstField.focus(), 50);
}

function closeModal() {
    $("modal").classList.remove("show");
}

/* ------------------------ nav / page switch ----------------------- */

const TITLES = {
    dashboard: ["Dashboard", "Track your developer growth"],
    skills: ["Skills", "Track your technical skill progress."],
    problems: ["DSA Problems", "Track your problem-solving journey."],
    projects: ["Projects", "Track the projects you're building."],
    goals: ["Daily Goals", "Small daily actions create big progress."],
    settings: ["Settings", "Manage your account and data."],
};

function showSection(section) {
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    document.querySelectorAll(".nav-btn").forEach((b) => b.classList.toggle("active", b.dataset.section === section));
    $(section).classList.add("active");
    const [title, subtitle] = TITLES[section] || ["", ""];
    $("pageTitle").textContent = title;
    $("pageSubtitle").textContent = subtitle;
    document.querySelector(".sidebar").classList.remove("open");
}

/* ----------------------------- helpers ---------------------------- */

function skillStatus(progress) {
    if (progress >= 80) return ["Strong", "status-strong"];
    if (progress >= 50) return ["Improving", "status-improving"];
    return ["Learning", "status-learning"];
}

function emptyState(heading, body) {
    return `<div class="empty"><h3>${esc(heading)}</h3><p>${esc(body)}</p></div>`;
}

/* ----------------------------- skills ----------------------------- */

function renderSkills(state) {
    const container = $("skillsContainer");
    if (!state.data.skills.length) {
        container.innerHTML = emptyState("No skills yet", "Add the first skill you want to track.");
        return;
    }
    container.innerHTML = state.data.skills
        .map((skill) => {
            const [label, cls] = skillStatus(skill.progress);
            return `
                <div class="skill-card">
                    <div class="card-top">
                        <div>
                            <h3>${esc(skill.name)}</h3>
                            <span class="category">${esc(skill.category)}</span>
                        </div>
                        <span class="status ${cls}">${label}</span>
                    </div>
                    <div class="skill-row">
                        <div class="skill-row-top"><span>Progress</span><strong>${skill.progress}%</strong></div>
                        <div class="progress"><div style="width:${skill.progress}%"></div></div>
                    </div>
                    <div class="card-actions">
                        <button class="edit-btn" data-action="edit-skill" data-id="${skill.id}">Edit</button>
                        <button class="delete-btn" data-action="delete-skill" data-id="${skill.id}">Delete</button>
                    </div>
                </div>
            `;
        })
        .join("");
}

function skillForm(skill = null) {
    const categories = ["Frontend", "Backend", "Problem Solving", "DevOps", "Design", "Tools"];
    return `
        <div class="form-group">
            <label for="f-name">Skill name</label>
            <input id="f-name" required placeholder="e.g. TypeScript" value="${skill ? esc(skill.name) : ""}">
        </div>
        <div class="form-group">
            <label for="f-category">Category</label>
            <select id="f-category">
                ${categories.map((c) => `<option ${skill?.category === c ? "selected" : ""}>${c}</option>`).join("")}
            </select>
        </div>
        <div class="form-group">
            <label for="f-progress">Progress (%)</label>
            <input id="f-progress" type="number" min="0" max="100" value="${skill ? skill.progress : 0}" required>
        </div>
        <button type="submit" class="modal-submit">${skill ? "Update skill" : "Add skill"}</button>
    `;
}

/* ---------------------------- problems ---------------------------- */

function renderProblems(state, filters) {
    const container = $("problemsContainer");
    const search = filters.search.trim().toLowerCase();
    const list = state.data.problems.filter((p) => {
        const title = String(p.title || "").toLowerCase();
        const topic = String(p.topic || "").toLowerCase();
        const matchSearch = !search || title.includes(search) || topic.includes(search);
        const matchDiff = filters.difficulty === "All" || p.difficulty === filters.difficulty;
        const matchStatus = filters.status === "All" || p.status === filters.status;
        return matchSearch && matchDiff && matchStatus;
    });

    if (!list.length) {
        container.innerHTML = emptyState("No problems found", "Try a different search or filter.");
    } else {
        container.innerHTML = list
            .map(
                (p) => `
                <div class="problem-card ${p.source === "LeetCode" ? "leetcode-card" : ""}">
                    <div class="problem-info">
                        <div class="problem-title-row">
                            <h3>${esc(p.title)}</h3>
                            ${p.source === "LeetCode" ? '<span class="leetcode-badge">LeetCode</span>' : ""}
                        </div>
                        <p>${esc(p.topic)}</p>
                    </div>
                    <div class="problem-tags">
                        <span class="tag ${p.difficulty.toLowerCase()}">${esc(p.difficulty)}</span>
                        <select class="status-select" data-action="set-problem-status" data-id="${esc(p.id)}" aria-label="Status for ${esc(p.title)}">
                            ${["Todo", "Attempted", "Solved"].map((s) => `<option ${p.status === s ? "selected" : ""}>${s}</option>`).join("")}
                        </select>
                        ${
                            p.url
                                ? `<a class="solve-btn" href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Solve ↗</a>`
                                : ""
                        }
                        ${
                            p.source !== "LeetCode"
                                ? `<button class="delete-btn" data-action="delete-problem" data-id="${esc(p.id)}">Delete</button>`
                                : ""
                        }
                    </div>
                </div>
            `
            )
            .join("");
    }

    const solved = state.data.problems.filter((p) => p.status === "Solved").length;
    const easy = state.data.problems.filter((p) => p.difficulty === "Easy").length;
    const medium = state.data.problems.filter((p) => p.difficulty === "Medium").length;
    const hard = state.data.problems.filter((p) => p.difficulty === "Hard").length;
    $("problemSolvedCount").textContent = solved;
    $("easyCount").textContent = easy;
    $("mediumCount").textContent = medium;
    $("hardCount").textContent = hard;
}

function problemForm() {
    return `
        <div class="form-group"><label for="f-title">Problem title</label>
            <input id="f-title" required placeholder="e.g. Two Sum"></div>
        <div class="form-group"><label for="f-topic">Topic</label>
            <input id="f-topic" required placeholder="e.g. Arrays"></div>
        <div class="form-group"><label for="f-difficulty">Difficulty</label>
            <select id="f-difficulty"><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
        <div class="form-group"><label for="f-status">Status</label>
            <select id="f-status"><option>Todo</option><option>Attempted</option><option>Solved</option></select></div>
        <button type="submit" class="modal-submit">Add problem</button>
    `;
}

/* ---------------------------- projects ---------------------------- */

function renderProjects(state) {
    const container = $("projectsContainer");
    if (!state.data.projects.length) {
        container.innerHTML = emptyState("No projects yet", "Add the first project you're building.");
        return;
    }
    container.innerHTML = state.data.projects
        .map(
            (p) => `
            <div class="project-card">
                <div class="card-top">
                    <div><h3>${esc(p.name)}</h3><span class="category">${esc(p.status)}</span></div>
                </div>
                <p class="project-description">${esc(p.description)}</p>
                <p class="tech">${esc(p.tech)}</p>
                <div class="project-progress"><span>Progress</span><strong>${p.progress}%</strong></div>
                <div class="progress"><div style="width:${p.progress}%"></div></div>
                <div class="card-actions">
                    <button class="edit-btn" data-action="edit-project" data-id="${p.id}">Edit</button>
                    <button class="delete-btn" data-action="delete-project" data-id="${p.id}">Delete</button>
                </div>
            </div>
        `
        )
        .join("");
}

function projectForm(project = null) {
    const statuses = ["Building", "In Progress", "Completed"];
    return `
        <div class="form-group"><label for="f-name">Project name</label>
            <input id="f-name" required value="${project ? esc(project.name) : ""}" placeholder="e.g. Expense Tracker"></div>
        <div class="form-group"><label for="f-desc">Description</label>
            <textarea id="f-desc" placeholder="Describe your project...">${project ? esc(project.description) : ""}</textarea></div>
        <div class="form-group"><label for="f-tech">Technologies</label>
            <input id="f-tech" value="${project ? esc(project.tech) : ""}" placeholder="HTML, CSS, JavaScript"></div>
        <div class="form-group"><label for="f-progress">Progress (%)</label>
            <input id="f-progress" type="number" min="0" max="100" value="${project ? project.progress : 0}"></div>
        <div class="form-group"><label for="f-status">Status</label>
            <select id="f-status">${statuses.map((s) => `<option ${project?.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
        <button type="submit" class="modal-submit">${project ? "Update project" : "Add project"}</button>
    `;
}

/* ------------------------------ goals ------------------------------ */

function renderGoals(state) {
    const container = $("goalsContainer");
    if (!state.data.goals.length) {
        container.innerHTML = emptyState("No goals yet", "Create your first daily goal.");
    } else {
        container.innerHTML = state.data.goals
            .map(
                (g) => `
                <div class="goal-item ${g.done ? "done" : ""}">
                    <input type="checkbox" ${g.done ? "checked" : ""} data-action="toggle-goal" data-id="${g.id}">
                    <span>${esc(g.text)}</span>
                    <button class="delete-btn" data-action="delete-goal" data-id="${g.id}">Delete</button>
                </div>
            `
            )
            .join("");
    }

    const { done, total, pct } = state.goalCompletion;
    $("goalText").textContent = `${done} of ${total} goal${total === 1 ? "" : "s"} completed`;
    $("goalRing").innerHTML = `${donutSvg(pct, { size: 110, stroke: 11 })}<div class="goal-ring-label"><strong>${pct}%</strong><span>done</span></div>`;
}

function goalForm() {
    return `
        <div class="form-group"><label for="f-text">Goal</label>
            <input id="f-text" required placeholder="e.g. Solve 3 DSA problems"></div>
        <button type="submit" class="modal-submit">Add goal</button>
    `;
}

/* ----------------------------- dashboard ---------------------------- */

function renderDashboard(state) {
    $("totalSkills").textContent = state.data.skills.length;
    $("solvedProblems").textContent = state.data.problems.filter((p) => p.status === "Solved").length;
    $("totalProjects").textContent = state.data.projects.length;
    const { done, total } = state.goalCompletion;
    $("goalStatsCard").textContent = `${done}/${total}`;

    const avg = state.overallSkillProgress;
    $("overallProgress").textContent = `${avg}%`;
    $("overallProgressBar").style.width = `${avg}%`;

    $("dashboardSkills").innerHTML = state.data.skills
        .slice(0, 5)
        .map(
            (s) => `
            <div class="skill-row">
                <div class="skill-row-top"><span>${esc(s.name)}</span><strong>${s.progress}%</strong></div>
                <div class="progress"><div style="width:${s.progress}%"></div></div>
            </div>
        `
        )
        .join("") || emptyState("No skills yet", "Add a skill to see it here.");

    const weakest = state.weakestSkill;
    $("recommendedSkill").textContent = weakest ? `Focus on ${weakest.name}` : "Add some skills";
    $("recommendationText").textContent = weakest
        ? `Currently at ${weakest.progress}% — your weakest tracked skill. A focused hour here moves the needle fastest.`
        : "Add your skills to receive a recommendation.";

    $("recentProblems").innerHTML =
        state.data.problems
            .slice(-4)
            .reverse()
            .map(
                (p) => `
            <div class="problem-card">
                <div class="problem-info"><div><h3>${esc(p.title)}</h3><p>${esc(p.topic)}</p></div></div>
                <div class="problem-tags">
                    <span class="tag ${p.difficulty.toLowerCase()}">${p.difficulty}</span>
                    <span class="tag">${p.status}</span>
                </div>
            </div>
        `
            )
            .join("") || emptyState("No problems yet", "Log your first problem to see it here.");

    // Level / XP
    const { current, span } = state.xpIntoLevel;
    $("levelBadge").textContent = `Lv. ${state.level}`;
    $("xpText").textContent = `${state.data.xp} XP · ${Math.max(span - current, 0)} to next level`;
    $("xpBar").style.width = `${span ? Math.min(100, Math.round((current / span) * 100)) : 100}%`;

    // Streak + weekly chart
    $("streakCount").textContent = state.streak;
    $("weeklyChart").innerHTML = weeklyBarChart(state.weeklyActivity);

    // Badges
    $("badgesGrid").innerHTML = BADGES.map((b) => {
        const unlocked = state.data.unlockedBadges.includes(b.id);
        return `
            <div class="badge ${unlocked ? "unlocked" : "locked"}" title="${esc(b.desc)}">
                <span class="badge-icon">${b.icon}</span>
                <span class="badge-label">${esc(b.label)}</span>
            </div>
        `;
    }).join("");
}

/* ----------------------------- profile chrome ------------------------ */

function renderIdentity(displayName) {
    const initial = (displayName || "?").trim().charAt(0).toUpperCase() || "?";
    $("avatarInitial").textContent = initial;
    $("profileName").textContent = displayName;
}

window.ST = window.ST || {};
ST.ui = {
    showToast, confirmDialog, openModal, closeModal, showSection,
    renderSkills, skillForm, renderProblems, problemForm,
    renderProjects, projectForm, renderGoals, goalForm,
    renderDashboard, renderIdentity,
};

})();


/* ============ main.js ============ */
/* =====================================================
   MAIN — bootstraps the app: shows the auth screen or
   the dashboard, wires navigation, and delegates every
   click/submit inside the app to the right state change.
===================================================== */

(function () {
"use strict";

const { Auth } = ST;
const { Storage } = ST;
const { AppState } = ST;
const {
    showToast, confirmDialog, openModal, closeModal, showSection,
    renderSkills, skillForm, renderProblems, problemForm,
    renderProjects, projectForm, renderGoals, goalForm,
    renderDashboard, renderIdentity,
} = ST.ui;

const $ = (id) => document.getElementById(id);

let state = null;
const problemFilters = { search: "", difficulty: "All", status: "All" };

/* ------------------------------- theme ------------------------------- */

function applyTheme(theme) {
    document.body.classList.toggle("light", theme === "light");
    $("themeBtn").textContent = theme === "light" ? "🌙 Dark mode" : "☀️ Light mode";
}

function toggleTheme() {
    const next = document.body.classList.contains("light") ? "dark" : "light";
    applyTheme(next);
    Storage.setGlobalTheme(next);
    if (state) {
        state.data.theme = next;
        state.save();
    }
}

/* ---------------------------- render everything ---------------------------- */

function renderAll() {
    renderDashboard(state);
    renderSkills(state);
    renderProblems(state, problemFilters);
    renderProjects(state);
    renderGoals(state);
    renderIdentity(state.data.displayName);
    checkNewBadges();
}

function checkNewBadges() {
    const newly = state.checkBadges();
    if (newly.length) {
        state.save();
        newly.forEach((b) => showToast(`Badge unlocked: ${b.icon} ${b.label}`, "success"));
        renderDashboard(state); // refresh badge grid without recursing into checkNewBadges
    }
}

/* ------------------------------- auth screen ------------------------------- */

function showApp() {
    $("authScreen").classList.remove("show");
    $("appShell").classList.remove("hidden");
    applyTheme(state.data.theme || "dark");
    showSection("dashboard");
    renderAll();
}

function showAuth() {
    $("appShell").classList.add("hidden");
    $("authScreen").classList.add("show");
    applyTheme(Storage.getGlobalTheme());
    $("loginUsername")?.focus();
}

function bootstrapSession() {
    const user = Auth.currentUser();
    if (user) {
        state = new AppState(user.username);
        showApp();
    } else {
        showAuth();
    }
}

function switchAuthTab(tab) {
    document.querySelectorAll(".auth-tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    document.querySelectorAll(".auth-panel").forEach((p) => p.classList.toggle("active", p.id === `auth-${tab}`));
    $("authError").textContent = "";
}

async function handleLogin(e) {
    e.preventDefault();
    $("authError").textContent = "";
    try {
        const user = await Auth.login({
            username: $("loginUsername").value,
            password: $("loginPassword").value,
            remember: $("loginRemember").checked,
        });
        state = new AppState(user.username);
        showToast(`Welcome back, ${user.displayName}!`);
        showApp();
    } catch (err) {
        $("authError").textContent = err.message;
    }
}

async function handleSignup(e) {
    e.preventDefault();
    $("authError").textContent = "";
    const password = $("signupPassword").value;
    const confirm = $("signupConfirm").value;
    if (password !== confirm) {
        $("authError").textContent = "Passwords don't match.";
        return;
    }
    try {
        const username = await Auth.signup({
            username: $("signupUsername").value,
            password,
            displayName: $("signupDisplayName").value,
            securityQuestion: $("signupSecurityQ").value,
            securityAnswer: $("signupSecurityA").value,
        });
        await Auth.login({ username, password, remember: true });
        state = new AppState(username);
        showToast("Account created — welcome to SkillTrack!");
        showApp();
    } catch (err) {
        $("authError").textContent = err.message;
    }
}

async function handleReset(e) {
    e.preventDefault();
    $("authError").textContent = "";
    try {
        await Auth.resetPassword($("resetUsername").value, $("resetAnswer").value, $("resetPassword").value);
        showToast("Password updated — you can log in now.");
        switchAuthTab("login");
    } catch (err) {
        $("authError").textContent = err.message;
    }
}

function handleLogout() {
    Auth.logout();
    state = null;
    showAuth();
    document.querySelectorAll("#auth-login form")[0]?.reset();
}

/* ------------------------------- settings page ------------------------------- */

function renderSettings() {
    $("settingsDisplayName").value = state.data.displayName;
    $("settingsUsername").textContent = state.username;
}

async function handleUpdateProfile(e) {
    e.preventDefault();
    const name = $("settingsDisplayName").value.trim();
    if (!name) return;
    state.data.displayName = name;
    state.save();
    const user = Storage.findUser(state.username);
    user.displayName = name;
    Storage.upsertUser(user);
    renderIdentity(name);
    showToast("Profile updated.");
}

async function handleChangePassword(e) {
    e.preventDefault();
    const errorEl = $("passwordError");
    errorEl.textContent = "";
    try {
        await Auth.changePassword(state.username, $("currentPassword").value, $("newPassword").value);
        showToast("Password changed.");
        e.target.reset();
    } catch (err) {
        errorEl.textContent = err.message;
    }
}

function handleExportData() {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `skilltrack-${state.username}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Data exported.");
}

function handleImportData(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
        try {
            const imported = JSON.parse(reader.result);
            if (!imported.skills || !imported.problems) throw new Error("File doesn't look like a SkillTrack export.");
            state.data = { ...state.data, ...imported };
            if (!Array.isArray(state.data.problems)) state.data.problems = [];
            ST.ensureLeetCodeProblems(state.data);
            state.save();
            renderAll();
            showToast("Data imported.");
        } catch (err) {
            showToast(err.message, "error");
        }
    };
    reader.readAsText(file);
    e.target.value = "";
}

async function handleResetData() {
    const ok = await confirmDialog({
        title: "Reset all data?",
        message: "This clears every skill, problem, project and goal for this account. This can't be undone.",
        confirmLabel: "Reset data",
    });
    if (!ok) return;
    state.data = {
        ...state.data,
        skills: [],
        problems: ST.createLeetCodeProblems(),
        projects: [],
        goals: [],
        xp: 0,
        activity: {},
        unlockedBadges: [],
    };
    state.save();
    renderAll();
    showToast("Data reset.");
}

async function handleDeleteAccount() {
    const ok = await confirmDialog({
        title: "Delete account?",
        message: `This permanently deletes ${state.username} and all of its data from this browser.`,
        confirmLabel: "Delete account",
    });
    if (!ok) return;
    Storage.deleteUser(state.username);
    Auth.logout();
    state = null;
    showAuth();
    showToast("Account deleted.");
}

/* ------------------------------- modal actions ------------------------------- */

function openSkillModal(skill = null) {
    openModal(skill ? "Edit skill" : "Add skill", skillForm(skill));
    $("modalForm").onsubmit = (e) => {
        e.preventDefault();
        const payload = {
            name: $("f-name").value.trim(),
            category: $("f-category").value,
            progress: Number($("f-progress").value),
        };
        if (!payload.name) return;
        if (skill) state.updateSkill(skill.id, payload);
        else state.addSkill(payload);
        closeModal();
        renderAll();
        showToast(skill ? "Skill updated." : "Skill added.");
    };
}

function openProblemModal() {
    openModal("Add DSA problem", problemForm());
    $("modalForm").onsubmit = (e) => {
        e.preventDefault();
        const payload = {
            title: $("f-title").value.trim(),
            topic: $("f-topic").value.trim(),
            difficulty: $("f-difficulty").value,
            status: $("f-status").value,
        };
        if (!payload.title || !payload.topic) return;
        state.addProblem(payload);
        closeModal();
        renderAll();
        showToast("Problem added.");
    };
}

function openProjectModal(project = null) {
    openModal(project ? "Edit project" : "Add project", projectForm(project));
    $("modalForm").onsubmit = (e) => {
        e.preventDefault();
        const payload = {
            name: $("f-name").value.trim(),
            description: $("f-desc").value.trim(),
            tech: $("f-tech").value.trim(),
            progress: Number($("f-progress").value) || 0,
            status: $("f-status").value,
        };
        if (!payload.name) return;
        if (project) state.updateProject(project.id, payload);
        else state.addProject(payload);
        closeModal();
        renderAll();
        showToast(project ? "Project updated." : "Project added.");
    };
}

function openGoalModal() {
    openModal("Add daily goal", goalForm());
    $("modalForm").onsubmit = (e) => {
        e.preventDefault();
        const text = $("f-text").value.trim();
        if (!text) return;
        state.addGoal(text);
        closeModal();
        renderAll();
        showToast("Goal added.");
    };
}

/* ------------------------------- event delegation ------------------------------- */

async function handleAppClick(e) {
    const actionEl = e.target.closest("[data-action]");
    if (!actionEl) return;
    const { action, id } = actionEl.dataset;

    switch (action) {
        case "edit-skill":
            openSkillModal(state.data.skills.find((s) => s.id === id));
            break;
        case "delete-skill": {
            const ok = await confirmDialog({ title: "Delete skill?", message: "This can't be undone." });
            if (ok) {
                state.deleteSkill(id);
                renderAll();
                showToast("Skill deleted.");
            }
            break;
        }
        case "delete-problem": {
            const ok = await confirmDialog({ title: "Delete problem?", message: "This can't be undone." });
            if (ok) {
                state.deleteProblem(id);
                renderAll();
                showToast("Problem deleted.");
            }
            break;
        }
        case "edit-project":
            openProjectModal(state.data.projects.find((p) => p.id === id));
            break;
        case "delete-project": {
            const ok = await confirmDialog({ title: "Delete project?", message: "This can't be undone." });
            if (ok) {
                state.deleteProject(id);
                renderAll();
                showToast("Project deleted.");
            }
            break;
        }
        case "delete-goal": {
            const ok = await confirmDialog({ title: "Delete goal?", message: "This can't be undone." });
            if (ok) {
                state.deleteGoal(id);
                renderAll();
                showToast("Goal deleted.");
            }
            break;
        }
    }
}

function handleAppChange(e) {
    const target = e.target;
    if (target.dataset.action === "set-problem-status") {
        state.updateProblemStatus(target.dataset.id, target.value);
        renderAll();
        showToast("Problem updated.");
    }
    if (target.dataset.action === "toggle-goal") {
        state.toggleGoal(target.dataset.id);
        renderAll();
    }
}

/* ------------------------------- wiring ------------------------------- */

function wireAuthScreen() {
    document.querySelectorAll(".auth-tab").forEach((tab) => {
        tab.addEventListener("click", () => switchAuthTab(tab.dataset.tab));
    });
    $("auth-login").querySelector("form").addEventListener("submit", handleLogin);
    $("auth-signup").querySelector("form").addEventListener("submit", handleSignup);
    $("auth-reset").querySelector("form").addEventListener("submit", handleReset);
    $("goToSignup").addEventListener("click", () => switchAuthTab("signup"));
    $("goToReset").addEventListener("click", () => switchAuthTab("reset"));
    $("goToLoginFromReset").addEventListener("click", () => switchAuthTab("login"));
}

function wireNav() {
    document.querySelectorAll(".nav-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const section = btn.dataset.section;
            showSection(section);
            if (section === "settings") renderSettings();
        });
    });
    $("menuToggle").addEventListener("click", () => document.querySelector(".sidebar").classList.toggle("open"));
    document.querySelectorAll("[data-section-jump]").forEach((btn) => {
        btn.addEventListener("click", () => showSection(btn.dataset.sectionJump));
    });
}

function wireModals() {
    document.querySelectorAll("[data-open-modal]").forEach((btn) => {
        btn.addEventListener("click", () => {
            const type = btn.dataset.openModal;
            if (type === "skill") openSkillModal();
            if (type === "problem") openProblemModal();
            if (type === "project") openProjectModal();
            if (type === "goal") openGoalModal();
        });
    });
    $("closeModalBtn").addEventListener("click", closeModal);
    $("modal").addEventListener("click", (e) => {
        if (e.target.id === "modal") closeModal();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeModal();
    });
}

function shuffleLeetCodeProblems() {
    const leetcode = state.data.problems.filter((p) => p.source === "LeetCode");
    const custom = state.data.problems.filter((p) => p.source !== "LeetCode");

    for (let i = leetcode.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [leetcode[i], leetcode[j]] = [leetcode[j], leetcode[i]];
    }

    state.data.problems = [...leetcode, ...custom];
    state.save();
    renderProblems(state, problemFilters);
    showToast("The 50 LeetCode problems were shuffled.");
}

function wireProblemFilters() {
    $("problemSearch").addEventListener("input", (e) => {
        problemFilters.search = e.target.value;
        renderProblems(state, problemFilters);
    });
    $("difficultyFilter").addEventListener("change", (e) => {
        problemFilters.difficulty = e.target.value;
        renderProblems(state, problemFilters);
    });
    $("statusFilter").addEventListener("change", (e) => {
        problemFilters.status = e.target.value;
        renderProblems(state, problemFilters);
    });
    $("shuffleLeetCodeBtn").addEventListener("click", shuffleLeetCodeProblems);
}

function wireSettings() {
    $("profileForm").addEventListener("submit", handleUpdateProfile);
    $("passwordForm").addEventListener("submit", handleChangePassword);
    $("exportBtn").addEventListener("click", handleExportData);
    $("importInput").addEventListener("change", handleImportData);
    $("resetDataBtn").addEventListener("click", handleResetData);
    $("deleteAccountBtn").addEventListener("click", handleDeleteAccount);
    $("logoutBtn").addEventListener("click", handleLogout);
}

function init() {
    wireAuthScreen();
    wireNav();
    wireModals();
    wireProblemFilters();
    wireSettings();
    $("themeBtn").addEventListener("click", toggleTheme);
    $("appShell").addEventListener("click", handleAppClick);
    $("appShell").addEventListener("change", handleAppChange);
    bootstrapSession();
}

document.addEventListener("DOMContentLoaded", init);

})();

