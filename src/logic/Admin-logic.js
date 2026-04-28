import { db, auth, SCRIPT_URL } from '../config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const RANK_LIST = [
    "Private", "Lance Corporal", "Corporal", "Sergeant", "Staff Sergeant",
    "Assistant Inspector", "Deputy Inspector", "Inspector", "Assistant Superintendent II",
    "Assistant Superintendent I", "Deputy Superintendent", "Superintendent",
    "Chief Superintendent", "Assistant Commander", "Deputy Commander", "Commander",
    "Assistant Brigade Commander", "Deputy Brigade Commander", "Brigade Commander"
];

const DEPT_LIST = [
    "Training & Doctrine", "Cadet Police", "Lion Striker Squad", "Cadet Special Squad",
    "Media & Publications", "Band", "Medical", "Regular"
];

let allOfficers = [];
let adminRole = "";
let adminState = "";
let adminProfile = {};
let currentTransferOfficer = null;

export function initAdminDashboard() {
    bindAdminUI();

    onAuthStateChanged(auth, async (user) => {
        const wrapper = document.getElementById('adminWrapper');
        const loader = document.getElementById('authGuardLoader');

        if (!user) return;

        try {
            const adminSnap = await getDoc(doc(db, "admins", user.uid));
            if (!adminSnap.exists()) {
                window.location.replace('/dashboard.html');
                return;
            }

            adminProfile = adminSnap.data() || {};
            if (adminProfile.status && adminProfile.status !== 'active') {
                alert("Account suspended. Contact National HQ.");
                window.handleLogout?.();
                return;
            }

            adminRole = String(adminProfile.role || adminProfile.Role || 'national').toLowerCase();
            adminState = adminProfile.assignedState || adminProfile.state || adminProfile.State || "";

            hydrateAdminShell(adminProfile, user);
            if (wrapper) wrapper.style.display = 'flex';

            await Promise.all([
                fetchRegistry(),
                loadResetTickets(),
                loadPromotions(),
                loadEnrollments(),
                loadAdminManager(),
                loadCourseManager()
            ]);
        } catch (error) {
            console.error('Admin dashboard init failed:', error);
            const tbody = document.getElementById('adminTableBody');
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">Unable to load admin dashboard.</td></tr>';
            }
        } finally {
            if (loader) loader.style.display = 'none';
        }
    });
}

function bindAdminUI() {
    const transferBtn = document.getElementById('transferBtn');
    const verifyTransferBtn = document.getElementById('verifyTransferBtn');
    const executeTransferBtn = document.getElementById('executeTransferBtn');
    const closeModalBtn = document.querySelector('.close-modal');
    const transferModal = document.getElementById('transferModal');
    const adminSearch = document.getElementById('adminSearch');
    const filterState = document.getElementById('filterState');
    const filterDept = document.getElementById('filterDept');
    const filterRank = document.getElementById('filterRank');
    const exportBtn = document.getElementById('exportBtn');
    const sidebarTarget = document.getElementById('adminSidebarTarget');
    const mobileToggle = document.getElementById('mobileToggle');
    const createCourseBtn = document.getElementById('createCourseBtn');
    const newAdminBtn = document.getElementById('newAdminBtn');
    const editForm = document.getElementById('editOfficerForm');
    const courseForm = document.getElementById('courseForm');
    const adminForm = document.getElementById('adminForm');
    const targetState = document.getElementById('targetState');

    if (transferBtn) transferBtn.addEventListener('click', openTransferModal);
    if (verifyTransferBtn) verifyTransferBtn.addEventListener('click', window.verifyTransfer);
    if (executeTransferBtn) executeTransferBtn.addEventListener('click', window.executeTransfer);
    if (closeModalBtn) closeModalBtn.addEventListener('click', closeTransferModal);
    if (transferModal) {
        transferModal.addEventListener('click', (e) => {
            if (e.target === transferModal) closeTransferModal();
        });
    }

    [adminSearch, filterState, filterDept, filterRank].forEach((el) => {
        if (el) el.addEventListener('input', applyFilters);
        if (el && el.tagName === 'SELECT') el.addEventListener('change', applyFilters);
    });

    if (exportBtn) exportBtn.addEventListener('click', exportRegistryCsv);
    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            document.querySelector('.cmd-sidebar')?.classList.toggle('active');
        });
    }
    if (createCourseBtn) createCourseBtn.addEventListener('click', initCourseModal);
    if (newAdminBtn) newAdminBtn.addEventListener('click', () => openModal('adminModal'));
    if (editForm) editForm.addEventListener('submit', submitPersonnelUpdate);
    if (courseForm) courseForm.addEventListener('submit', submitCourse);
    if (adminForm) adminForm.addEventListener('submit', submitAdmin);
    if (targetState) targetState.addEventListener('change', (e) => populateTargetAreas(e.target.value));

    if (sidebarTarget) {
        sidebarTarget.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-section]');
            if (!btn) return;
            switchSection(btn.dataset.section);
        });
    }

    document.querySelectorAll('[data-close-modal]').forEach((btn) => {
        btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
    });
}

function hydrateAdminShell(adminData, user) {
    const sidebarTarget = document.getElementById('adminSidebarTarget');
    const title = document.getElementById('adminPanelTitle');
    const transferBtn = document.getElementById('transferBtn');

    if (title) {
        title.textContent = adminRole === 'state' && adminState
            ? `${adminState} Command Registry`
            : 'Personnel Registry';
    }

    if (transferBtn) {
        transferBtn.style.display = adminRole === 'super' || adminRole === 'national' ? 'inline-flex' : 'none';
    }

    if (sidebarTarget) {
        const displayName = adminData.name || adminData.fullName || user.email || 'Administrator';
        const roleLabel = adminRole === 'state'
            ? `${adminState || 'State'} Command`
            : 'National HQ';
        const showSuper = adminRole === 'super' || adminRole === 'national';

        sidebarTarget.innerHTML = `
            <aside class="cmd-sidebar">
                <div class="sidebar-top">
                    <img src="/logo.png" class="sidebar-logo" alt="CADETI logo">
                    <div class="admin-identity">
                        <h3 id="adminRoleName">${displayName}</h3>
                        <span id="adminScope">${roleLabel}</span>
                    </div>
                </div>
                <div class="kpi-grid">
                    <div class="kpi-card">
                        <small>STRENGTH</small>
                        <h2 id="kpiTotalOfficers">0</h2>
                    </div>
                    <div class="kpi-card accent-gold">
                        <small>QUEUE</small>
                        <h2 id="kpiTotalStates">0</h2>
                    </div>
                </div>
                <nav class="cmd-nav">
                    <button class="nav-btn active" type="button" data-section="registry"><i class="fa-solid fa-database"></i><span>Registry</span></button>
                    <button class="nav-btn" type="button" data-section="promotions"><i class="fa-solid fa-award"></i><span>Promotions</span></button>
                    <button class="nav-btn" type="button" data-section="enrollments"><i class="fa-solid fa-graduation-cap"></i><span>Applications</span></button>
                    <button class="nav-btn" type="button" data-section="graduation"><i class="fa-solid fa-file-signature"></i><span>Graduation</span></button>
                    <button class="nav-btn" type="button" data-section="resets"><i class="fa-solid fa-key"></i><span>Security Hub</span></button>
                    <div class="nav-group" id="superAdminTools" style="display: ${showSuper ? 'block' : 'none'};">
                        <label>HQ Control</label>
                        <button class="nav-btn" type="button" data-section="courses"><i class="fa-solid fa-book"></i><span>Publisher</span></button>
                        <button class="nav-btn" type="button" data-section="admins"><i class="fa-solid fa-shield-halved"></i><span>Admins</span></button>
                    </div>
                </nav>
                <div class="sidebar-bottom">
                    <button class="action-btn-outline" type="button" id="syncDataBtn">Sync Data</button>
                    <button class="exit-btn" type="button" onclick="handleLogout()">Exit</button>
                </div>
            </aside>
        `;

        document.getElementById('syncDataBtn')?.addEventListener('click', refreshAll);
    }
}

function switchSection(section) {
    document.querySelectorAll('.tab-content').forEach((panel) => {
        const isActive = panel.id === `section-${section}`;
        panel.style.display = isActive ? 'block' : 'none';
        panel.classList.toggle('active', isActive);
    });

    document.querySelectorAll('.cmd-nav [data-section]').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.section === section);
    });
}

async function refreshAll() {
    await Promise.all([
        fetchRegistry(),
        loadResetTickets(),
        loadPromotions(),
        loadEnrollments(),
        loadAdminManager(),
        loadCourseManager()
    ]);
}

async function fetchRegistry() {
    const tbody = document.getElementById('adminTableBody');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">Syncing Registry...</td></tr>';
    }

    try {
        const res = await fetch(`${SCRIPT_URL}?action=getAdminData`);
        const payload = await res.json();
        let data = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];

        if (adminRole === 'state' && adminState) {
            data = data.filter((o) => (o["State Command"] || "").trim() === adminState);
        }

        allOfficers = data;
        populateFilters(allOfficers);
        renderTable(allOfficers);
        updateKpis(allOfficers);
    } catch (error) {
        console.error('Registry load failed:', error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Connection error while loading registry.</td></tr>';
        }
    }
}

function renderTable(data) {
    const tbody = document.getElementById('adminTableBody');
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center">No officers found.</td></tr>';
        return;
    }

    tbody.innerHTML = [...data].reverse().map((o) => {
        const uniqueId = o["Unique ID"] || o["Service Number"] || 'N/A';
        const name = `${o["Surname"] || ''}, ${o["First Name"] || ''}`.replace(/^,\s*/, '');
        const timestamp = o["Timestamp"] ? String(o["Timestamp"]).split('T')[0] : 'N/A';
        return `
            <tr>
                <td>${timestamp}</td>
                <td><code>${uniqueId}</code></td>
                <td><strong>${name}</strong></td>
                <td><span class="rank-badge ${(o["Rank"] || '').toLowerCase().includes('commander') ? 'badge-red' : 'badge-green'}">${o["Rank"] || 'N/A'}</span></td>
                <td>${o["Department"] || 'N/A'}</td>
                <td>${o["State Command"] || 'N/A'}</td>
                <td>
                    <div class="row-actions">
                        <button class="action-icon" type="button" onclick="window.openEditModal('${String(uniqueId).replace(/'/g, "\\'")}')"><i class="fa-solid fa-user-pen"></i></button>
                        ${o["PDF URL"] ? `<a href="${o["PDF URL"]}" target="_blank" class="pdf-btn">PDF</a>` : `<button class="action-icon" type="button" onclick="window.viewOfficer('${String(uniqueId).replace(/'/g, "\\'")}')"><i class="fa-solid fa-eye"></i></button>`}
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function populateFilters(data) {
    populateSelect('filterState', [...new Set(data.map((o) => o["State Command"]).filter(Boolean))].sort(), 'States', adminRole === 'state' ? adminState : '');
    populateSelect('filterDept', [...new Set(data.map((o) => o["Department"]).filter(Boolean))].sort(), 'Departments');
    populateSelect('filterRank', RANK_LIST, 'Ranks');
    populateSelect('newAdminState', [...new Set(data.map((o) => o["State Command"]).filter(Boolean))].sort(), 'Select State');
    populateSelect('targetState', [...new Set(data.map((o) => o["State Command"]).filter(Boolean))].sort(), 'Select State');
    populateTargetAreas(document.getElementById('targetState')?.value || '');
}

function populateSelect(id, options, placeholder, forcedValue = null) {
    const el = document.getElementById(id);
    if (!el) return;
    const currentValue = forcedValue ?? el.value;
    el.innerHTML = `<option value="">${placeholder}</option>`;
    options.forEach((value) => el.add(new Option(value, value)));
    if (forcedValue) {
        el.value = forcedValue;
        el.disabled = true;
    } else if (options.includes(currentValue)) {
        el.value = currentValue;
    }
}

function populateTargetAreas(state) {
    const targetArea = document.getElementById('targetArea');
    if (!targetArea) return;

    const currentValue = targetArea.value;
    const areas = [...new Set(
        allOfficers
            .filter((officer) => !state || officer["State Command"] === state)
            .map((officer) => officer["Area Command"])
            .filter(Boolean)
    )].sort();

    targetArea.innerHTML = '<option value="">Select Area</option>';
    areas.forEach((area) => targetArea.add(new Option(area, area)));

    if (areas.includes(currentValue)) {
        targetArea.value = currentValue;
    } else {
        targetArea.value = "";
    }
}

function applyFilters() {
    const searchTerm = (document.getElementById('adminSearch')?.value || '').trim().toLowerCase();
    const selectedState = document.getElementById('filterState')?.value || '';
    const selectedDept = document.getElementById('filterDept')?.value || '';
    const selectedRank = document.getElementById('filterRank')?.value || '';

    const filtered = allOfficers.filter((officer) => {
        const haystack = [
            officer["Service Number"],
            officer["Unique ID"],
            officer["Surname"],
            officer["First Name"]
        ].filter(Boolean).join(' ').toLowerCase();

        return (!searchTerm || haystack.includes(searchTerm))
            && (!selectedState || officer["State Command"] === selectedState)
            && (!selectedDept || officer["Department"] === selectedDept)
            && (!selectedRank || officer["Rank"] === selectedRank);
    });

    renderTable(filtered);
    updateKpis(filtered);
}

function updateKpis(data) {
    const totalEl = document.getElementById('kpiTotalOfficers');
    const queueEl = document.getElementById('kpiTotalStates');
    if (totalEl) totalEl.textContent = String(data.length);
    if (queueEl) {
        const queueCount = data.filter((item) => (item["Unique ID"] && String(item["Unique ID"]).startsWith("REC/")) || item["Member Category"] === "Recruit").length;
        queueEl.textContent = String(queueCount);
    }
}

async function loadResetTickets() {
    const tbody = document.getElementById('resetTicketsBody');
    if (!tbody) return;

    try {
        const snap = await getDocs(collection(db, "password_resets"));
        const rows = [];
        snap.forEach((docSnap) => {
            const t = docSnap.data();
            if (t.status !== 'pending') return;
            rows.push(`
                <tr>
                    <td><div class="cell-stack"><b>${t.officerName || 'Unknown'}</b><small>${t.contactEmail || 'No Email'}</small></div></td>
                    <td><code>${t.serviceNumber || 'N/A'}</code></td>
                    <td><small>${t.requestedAt?.toDate?.().toLocaleString?.() || 'N/A'}</small></td>
                    <td><span class="rank-badge badge-red">PENDING</span></td>
                    <td><button class="cmd-btn-small" type="button" onclick="window.approveReset('${docSnap.id}', '${t.contactEmail || ''}', '${t.officerName || ''}', '${t.serviceNumber || ''}')">APPROVE & SEND</button></td>
                </tr>
            `);
        });
        tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="text-center">No active reset requests.</td></tr>';
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Unable to load reset tickets.</td></tr>';
    }
}

async function loadPromotions() {
    const tbody = document.getElementById('promotionBody');
    if (!tbody) return;

    try {
        let qRef = collection(db, "promotion_queue");
        if (adminRole === 'state' && adminState) {
            qRef = query(qRef, where("state", "==", adminState));
        }
        const snap = await getDocs(qRef);
        const rows = [];
        snap.forEach((docSnap) => {
            const p = docSnap.data();
            rows.push(`
                <tr>
                    <td><b>${p.fullName || 'Unknown'}</b></td>
                    <td>${p.currentRank || 'N/A'}</td>
                    <td><span class="rank-badge badge-gold">${p.proposedRank || 'N/A'}</span></td>
                    <td>${p.state || 'N/A'}</td>
                    <td>${(adminRole === 'super' || adminRole === 'national')
                        ? `<button class="cmd-btn-small" type="button" onclick="window.approvePromotion('${docSnap.id}', '${p.uniqueID}', '${p.proposedRank}')">APPROVE</button>`
                        : `<span class="rank-badge badge-red">PENDING HQ</span>`}</td>
                </tr>
            `);
        });
        tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="text-center">Queue is clear.</td></tr>';
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Unable to load promotion queue.</td></tr>';
    }
}

async function loadEnrollments() {
    const tbody = document.getElementById('enrollmentBody');
    if (!tbody) return;

    try {
        let qRef = collection(db, "enrollments");
        if (adminRole === 'state' && adminState) {
            qRef = query(qRef, where("state", "==", adminState));
        }
        const snap = await getDocs(qRef);
        const rows = [];
        snap.forEach((docSnap) => {
            const d = docSnap.data();
            const isDone = d.status === 'completed';
            rows.push(`
                <tr>
                    <td><b>${d.fullName || 'Unknown'}</b></td>
                    <td>${d.courseTitle || 'N/A'}</td>
                    <td>${d.dateApplied?.toDate?.().toLocaleDateString?.() || 'N/A'}</td>
                    <td><span class="rank-badge ${isDone ? 'badge-green' : 'badge-red'}">${d.status || 'pending'}</span></td>
                    <td>${isDone ? 'Awarded' : `<button class="cmd-btn-small" type="button" onclick="window.updateEnrollment('${docSnap.id}', 'completed')">APPROVE</button>`}</td>
                </tr>
            `);
        });
        tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="text-center">No training applications found.</td></tr>';
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Unable to load enrollments.</td></tr>';
    }
}

async function loadAdminManager() {
    const tbody = document.getElementById('adminUserBody');
    const sectionBtn = document.querySelector('[data-section="admins"]');
    const createBtn = document.getElementById('newAdminBtn');
    if (!tbody) return;

    const canManage = adminRole === 'super' || adminRole === 'national';
    if (sectionBtn) sectionBtn.style.display = canManage ? '' : 'none';
    if (createBtn) createBtn.style.display = canManage ? '' : 'none';
    if (!canManage) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Admin tools are restricted.</td></tr>';
        return;
    }

    try {
        const snap = await getDocs(collection(db, "admins"));
        const rows = [];
        snap.forEach((docSnap) => {
            const a = docSnap.data();
            const isSuspended = a.status === 'suspended';
            rows.push(`
                <tr>
                    <td><b>${a.name || a.fullName || 'Unnamed Admin'}</b></td>
                    <td>${a.assignedState || a.state || 'National'}</td>
                    <td>${a.role || 'state'}</td>
                    <td><span class="rank-badge ${isSuspended ? 'badge-red' : 'badge-green'}">${a.status || 'active'}</span></td>
                    <td><button class="action-icon" type="button" onclick="window.updateAdminStatus('${docSnap.id}', '${isSuspended ? 'active' : 'suspended'}')"><i class="fa-solid fa-user-slash"></i></button></td>
                </tr>
            `);
        });
        tbody.innerHTML = rows.length ? rows.join('') : '<tr><td colspan="5" class="text-center">No admin records found.</td></tr>';
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center">Unable to load admin records.</td></tr>';
    }
}

async function loadCourseManager() {
    const grid = document.getElementById('courseListGrid');
    const sectionBtn = document.querySelector('[data-section="courses"]');
    const createBtn = document.getElementById('createCourseBtn');
    if (!grid) return;

    const canManage = adminRole === 'super' || adminRole === 'national';
    if (sectionBtn) sectionBtn.style.display = canManage ? '' : 'none';
    if (createBtn) createBtn.style.display = canManage ? '' : 'none';
    if (!canManage) {
        grid.innerHTML = '<div class="placeholder-surface"><h3>Publisher restricted</h3><p>This tool is available to HQ admins only.</p></div>';
        return;
    }

    try {
        const snap = await getDocs(collection(db, "courses"));
        const cards = [];
        snap.forEach((docSnap) => {
            const c = docSnap.data();
            cards.push(`
                <div class="course-card">
                    <small>Rank Req: ${c.minRankLevel || 'N/A'}</small>
                    <h4>${c.title || 'Untitled Course'}</h4>
                    <p>${c.description || 'No description added yet.'}</p>
                    <button class="cmd-btn-small" type="button" onclick="window.deleteCourse('${docSnap.id}')">REMOVE</button>
                </div>
            `);
        });
        grid.innerHTML = cards.length ? cards.join('') : '<div class="placeholder-surface"><h3>No courses published</h3><p>Create your first course from the button above.</p></div>';
    } catch (error) {
        grid.innerHTML = '<div class="placeholder-surface"><h3>Publisher unavailable</h3><p>Unable to load course data right now.</p></div>';
    }
}

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

function openTransferModal() {
    document.getElementById('transferSearchID').value = '';
    document.getElementById('tName').innerText = '---';
    document.getElementById('tCurrentLocation').innerText = '---';
    document.getElementById('transferDetails').style.display = 'none';
    document.getElementById('targetState').value = '';
    populateTargetAreas('');
    openModal('transferModal');
}

function closeTransferModal() {
    closeModal('transferModal');
}

async function submitPersonnelUpdate(e) {
    e.preventDefault();
    const uid = document.getElementById('editUid')?.value;
    const officer = allOfficers.find((o) => (o["Unique ID"] || o["Service Number"]) === uid);
    if (!uid || !officer) return;

    const newRank = document.getElementById('editRank')?.value || '';
    const payload = {
        postHeld: document.getElementById('editPost')?.value || '',
        department: document.getElementById('editDept')?.value || ''
    };

    try {
        const qRef = query(collection(db, "users"), where("uniqueID", "==", uid));
        const snap = await getDocs(qRef);
        const docId = snap.empty ? uid : snap.docs[0].id;

        if (adminRole === 'super' || adminRole === 'national') {
            await setDoc(doc(db, "users", docId), { ...payload, rank: newRank }, { merge: true });
            alert("Record updated.");
        } else {
            await setDoc(doc(db, "users", docId), payload, { merge: true });
            if (newRank && newRank !== officer["Rank"]) {
                await addDoc(collection(db, "promotion_queue"), {
                    fullName: `${officer["Surname"] || ''} ${officer["First Name"] || ''}`.trim(),
                    uniqueID: uid,
                    currentRank: officer["Rank"] || '',
                    proposedRank: newRank,
                    state: adminState,
                    recommender: auth.currentUser?.uid || '',
                    timestamp: serverTimestamp()
                });
                alert("Rank recommendation sent.");
            } else {
                alert("Record updated.");
            }
        }
    } catch (error) {
        console.error(error);
        alert("Permission error.");
    } finally {
        closeModal('editModal');
        await Promise.all([fetchRegistry(), loadPromotions()]);
    }
}

async function submitCourse(e) {
    e.preventDefault();
    if (!(adminRole === 'super' || adminRole === 'national')) return;

    const payload = {
        title: document.getElementById('cTitle')?.value || '',
        description: document.getElementById('cDesc')?.value || '',
        minRankLevel: document.getElementById('cRank')?.value || '',
        badgeUrl: document.getElementById('cBadge')?.value || '',
        eligibleDepts: [...document.querySelectorAll('input[name="eligibleDepts"]:checked')].map((el) => el.value),
        eligibleStates: [...document.querySelectorAll('input[name="eligibleStates"]:checked')].map((el) => el.value),
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "courses"), payload);
        alert("Course deployed.");
        closeModal('courseModal');
        document.getElementById('courseForm')?.reset();
        await loadCourseManager();
    } catch (error) {
        console.error(error);
        alert("Unable to deploy course.");
    }
}

async function submitAdmin(e) {
    e.preventDefault();
    if (!(adminRole === 'super' || adminRole === 'national')) return;

    const payload = {
        name: document.getElementById('newAdminName')?.value || '',
        email: document.getElementById('newAdminEmail')?.value || '',
        assignedState: document.getElementById('newAdminState')?.value || '',
        role: document.getElementById('newAdminRole')?.value || 'state',
        status: 'active',
        createdAt: serverTimestamp()
    };

    try {
        await addDoc(collection(db, "admin_invites"), payload);
        alert("Admin request saved.");
        closeModal('adminModal');
        document.getElementById('adminForm')?.reset();
    } catch (error) {
        console.error(error);
        alert("Unable to save admin request.");
    }
}

function initCourseModal() {
    const cRank = document.getElementById('cRank');
    if (cRank && cRank.options.length <= 1) {
        cRank.innerHTML = '<option value="">Select Rank Level</option>';
        RANK_LIST.forEach((rank, index) => cRank.add(new Option(rank, String(index + 1))));
    }

    const deptList = document.getElementById('cDeptsList');
    if (deptList) {
        deptList.innerHTML = DEPT_LIST.map((dept) => `
            <label class="check-item"><input type="checkbox" name="eligibleDepts" value="${dept}"> ${dept}</label>
        `).join('');
    }

    const stateList = document.getElementById('cStatesList');
    if (stateList) {
        const states = [...new Set(allOfficers.map((item) => item["State Command"]).filter(Boolean))].sort();
        stateList.innerHTML = states.map((state) => `
            <label class="check-item"><input type="checkbox" name="eligibleStates" value="${state}"> ${state}</label>
        `).join('');
    }

    openModal('courseModal');
}

window.openEditModal = (uid) => {
    const officer = allOfficers.find((o) => (o["Unique ID"] || o["Service Number"]) === uid);
    if (!officer) return;

    document.getElementById('editUid').value = uid;
    document.getElementById('editPost').value = officer["Post Held"] || '';
    populateSelect('editDept', DEPT_LIST, 'Select Department');
    document.getElementById('editDept').value = officer["Department"] || DEPT_LIST[DEPT_LIST.length - 1];
    populateSelect('editRank', RANK_LIST, 'Select Rank');
    document.getElementById('editRank').value = officer["Rank"] || '';
    openModal('editModal');
};

window.viewOfficer = (uniqueId) => {
    if (!uniqueId) return;
    alert(`Officer record selected: ${uniqueId}`);
};

window.updateEnrollment = async (id, status) => {
    await updateDoc(doc(db, "enrollments", id), { status });
    await loadEnrollments();
};

window.updateAdminStatus = async (id, status) => {
    await updateDoc(doc(db, "admins", id), { status });
    await loadAdminManager();
};

window.deleteCourse = async (id) => {
    if (!confirm("Delete this course?")) return;
    await deleteDoc(doc(db, "courses", id));
    await loadCourseManager();
};

window.approvePromotion = async (queueId, officerID, newRank) => {
    const qRef = query(collection(db, "users"), where("uniqueID", "==", officerID));
    const snap = await getDocs(qRef);
    const docId = snap.empty ? officerID : snap.docs[0].id;
    await setDoc(doc(db, "users", docId), { uniqueID: officerID, rank: newRank }, { merge: true });
    await deleteDoc(doc(db, "promotion_queue", queueId));
    await Promise.all([loadPromotions(), fetchRegistry()]);
};

window.approveReset = async (ticketId, email, name, serviceNo) => {
    if (!confirm(`Restore access for ${name}? \nA temporary password will be sent to ${email}.`)) return;

    const tempPass = "CAD-" + Math.random().toString(36).slice(-5).toUpperCase();
    try {
        const apiUrl = `${SCRIPT_URL}?action=sendResetInstructions&email=${encodeURIComponent(email)}&name=${encodeURIComponent(name)}&serviceNo=${encodeURIComponent(serviceNo)}&tempPass=${tempPass}`;
        const response = await fetch(apiUrl);
        const result = await response.json();

        if (result.status === "success") {
            await updateDoc(doc(db, "password_resets", ticketId), {
                status: "resolved",
                tempPasswordUsed: tempPass,
                resolvedAt: serverTimestamp()
            });
            alert(`Success! Officer ${name} has been sent temporary credentials.`);
            await loadResetTickets();
        } else {
            throw new Error(result.message || 'Unknown reset error');
        }
    } catch (error) {
        console.error("Restore Error:", error);
        alert("Failed to restore access.");
    }
};

window.verifyTransfer = async () => {
    const sn = document.getElementById('transferSearchID')?.value.trim() || '';
    const btn = document.getElementById('verifyTransferBtn');

    if (!sn) return alert("Enter a service number.");
    if (btn) btn.innerText = "Searching...";

    try {
        const res = await fetch(`${SCRIPT_URL}?action=searchByServiceNumber&serviceNumber=${encodeURIComponent(sn)}`);
        const result = await res.json();

        if (result.status === "success") {
            const officer = result.data;
            currentTransferOfficer = officer;
            document.getElementById('tName').innerText = `${officer["Surname"]} ${officer["First Name"]}`;
            document.getElementById('tCurrentLocation').innerText = `${officer["State Command"]} (${officer["Area Command"]})`;
            document.getElementById('transferDetails').style.display = 'block';
        } else {
            currentTransferOfficer = null;
            alert("Service Number not found in Registry.");
        }
    } catch (error) {
        alert("Search error.");
    } finally {
        if (btn) btn.innerText = "Find Officer";
    }
};

window.executeTransfer = async () => {
    const sn = document.getElementById('transferSearchID')?.value.trim() || '';
    const newState = document.getElementById('targetState')?.value || '';
    const newArea = document.getElementById('targetArea')?.value || '';

    if (!newState || !newArea) return alert("Select target command.");
    if (!confirm(`Are you sure you want to transfer ${sn} to ${newState} Command?`)) return;

    try {
        const gasUrl = `${SCRIPT_URL}?action=transferOfficer&serviceNumber=${encodeURIComponent(sn)}&newState=${encodeURIComponent(newState)}&newArea=${encodeURIComponent(newArea)}`;
        const res = await fetch(gasUrl);
        const result = await res.json();

        if (result.status === "success") {
            await updateTransferredOfficerLocation(sn, newState, newArea);
            alert("Command transfer successful. Location details updated without changing service number or unique ID.");
            currentTransferOfficer = null;
            await refreshAll();
            closeTransferModal();
        } else {
            alert("Transfer failed.");
        }
    } catch (error) {
        alert("Transfer failed.");
    }
};

async function updateTransferredOfficerLocation(serviceNumber, stateCommand, areaCommand) {
    const officer = currentTransferOfficer || allOfficers.find((item) => (item["Service Number"] || "").trim() === serviceNumber);
    const uniqueId = officer?.["Unique ID"] || officer?.uniqueID || "";

    const updates = {
        state: stateCommand,
        area: areaCommand,
        stateCommand,
        areaCommand,
        currentState: stateCommand,
        currentArea: areaCommand,
        "State Command": stateCommand,
        "Area Command": areaCommand,
        updatedAt: serverTimestamp()
    };

    let updated = false;

    if (uniqueId) {
        const uniqueQuery = query(collection(db, "users"), where("uniqueID", "==", uniqueId));
        const uniqueSnap = await getDocs(uniqueQuery);
        if (!uniqueSnap.empty) {
            await Promise.all(uniqueSnap.docs.map((docSnap) => updateDoc(doc(db, "users", docSnap.id), updates)));
            updated = true;
        }
    }

    if (!updated) {
        const serviceQuery = query(collection(db, "users"), where("serviceNumber", "==", serviceNumber));
        const serviceSnap = await getDocs(serviceQuery);
        if (!serviceSnap.empty) {
            await Promise.all(serviceSnap.docs.map((docSnap) => updateDoc(doc(db, "users", docSnap.id), updates)));
            updated = true;
        }
    }

    if (!updated && uniqueId) {
        await setDoc(doc(db, "users", uniqueId), {
            uniqueID: uniqueId,
            serviceNumber,
            ...updates
        }, { merge: true });
    }

    allOfficers = allOfficers.map((item) => {
        if ((item["Service Number"] || "").trim() !== serviceNumber) return item;
        return {
            ...item,
            "State Command": stateCommand,
            "Area Command": areaCommand
        };
    });

    const locationText = `${stateCommand} (${areaCommand})`;
    document.getElementById('tCurrentLocation').innerText = locationText;
}

function exportRegistryCsv() {
    if (!allOfficers.length) return;

    const rows = [
        ['Timestamp', 'Service Number', 'Unique ID', 'Surname', 'First Name', 'Rank', 'Department', 'State Command'],
        ...allOfficers.map((o) => [
            o["Timestamp"] || '',
            o["Service Number"] || '',
            o["Unique ID"] || '',
            o["Surname"] || '',
            o["First Name"] || '',
            o["Rank"] || '',
            o["Department"] || '',
            o["State Command"] || ''
        ])
    ];

    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'cadeti-registry.csv';
    link.click();
    URL.revokeObjectURL(link.href);
}
