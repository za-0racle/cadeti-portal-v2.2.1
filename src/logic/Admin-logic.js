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
import { setupAdminPasswordModal } from './AdminPassword.js';
import { generateIDCard as generateFormattedIDCard } from './ID-generator.js';
import { getAdminAssignedState, getAdminDisplayName, getAdminRole } from '../utils/adminProfile.js';

const RANK_LIST = [
    "Private", "Lance Corporal", "Corporal", "Sergeant", "Staff Sergeant",
    "Assistant Inspector", "Deputy Inspector", "Inspector", "Assistant Superintendent II",
    "Assistant Superintendent I", "Deputy Superintendent", "Superintendent",
    "Chief Superintendent", "Assistant Commander", "Deputy Commander", "Commander",
    "Assistant Brigade Commander", "Deputy Brigade Commander", "Brigade Commander"
];

const DEPT_LIST = [
    "Training & Doctrine", "Cadet Police", "Lion Striker Squad", "Cadet Special Squad",
    "Media & Publications", "Admin and Finance", "Band", "Medical", "Regular"
];

let allOfficers = [];
let adminRole = "";
let adminState = "";
let adminProfile = {};
let currentTransferOfficer = null;
let allCourses = [];
let filteredRegistry = null;

async function postScriptAction(payload) {
    const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (result.status !== "success") {
        throw new Error(result.message || "Registry update failed.");
    }
    return result;
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error("Unable to read badge image."));
        reader.readAsDataURL(file);
    });
}

async function uploadCourseBadge(file) {
    const dataUrl = await fileToBase64(file);
    const [, base64 = ""] = dataUrl.split(',');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);

    try {
        const response = await fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            signal: controller.signal,
            body: JSON.stringify({
                action: "uploadMedia",
                base64,
                mimeType: file.type,
                fileName: `course-badge-${Date.now()}-${file.name}`
            })
        });

        const result = await response.json();
        if (result.status !== "success" || !result.url) {
            throw new Error(result.message || "Badge upload failed.");
        }

        return result.url;
    } catch (error) {
        if (error.name === "AbortError") {
            throw new Error("Badge upload timed out. Please try a smaller image or check your connection.");
        }
        throw error;
    } finally {
        clearTimeout(timeout);
    }
}

function extractDriveFileId(url) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl || cleanUrl === "N/A") return "";

    if (cleanUrl.includes("drive.google.com")) {
        const driveId = cleanUrl.match(/[-\w]{25,}/);
        return driveId?.[0] || "";
    }

    return "";
}

function getImageCandidates(url) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl || cleanUrl === "N/A") return ["/logo.png"];

    const driveId = extractDriveFileId(cleanUrl);
    if (driveId) {
        return [
            `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
            `https://drive.google.com/uc?export=view&id=${driveId}`,
            `https://lh3.googleusercontent.com/d/${driveId}=w1000`,
            cleanUrl,
            "/logo.png"
        ];
    }

    return [cleanUrl, "/logo.png"];
}

function createAdminImageMarkup(url, alt, className = '') {
    const candidates = getImageCandidates(url);
    const safeAlt = String(alt || 'Image').replace(/"/g, '&quot;');
    const imageClass = ['admin-managed-image', className].filter(Boolean).join(' ');
    return `
        <img
            class="${imageClass}"
            src="${candidates[0]}"
            data-image-candidates='${JSON.stringify(candidates)}'
            data-image-index="0"
            alt="${safeAlt}"
            loading="lazy"
            referrerpolicy="no-referrer"
        >
    `;
}

function escapeInline(value) {
    return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, ' ');
}

function getOfficerName(officer = {}) {
    return [officer["Surname"], officer["First Name"], officer["Middle Name"]].filter(Boolean).join(' ').trim()
        || officer.fullName
        || 'Unknown Officer';
}

function getOfficerPassport(officer = {}) {
    return officer["Passport URL"] || officer.passportUrl || officer.photoUrl || officer.photo || officer.passport || '';
}

function getOfficerSignature(officer = {}) {
    return officer["Signature URL"] || officer.signatureUrl || officer.signature || '';
}

function getAuthoritySignature(admin = {}) {
    return admin.authorisedSignatureUrl
        || admin.authorizedSignatureUrl
        || admin.nationalAdjutantSignatureUrl
        || admin["Authorised Signature URL"]
        || '';
}

function wireAdminImages(root = document) {
    root.querySelectorAll('.admin-managed-image').forEach((image) => {
        if (image.dataset.imageBound === 'true') return;
        image.dataset.imageBound = 'true';

        image.addEventListener('error', () => {
            let candidates = [];
            try {
                candidates = JSON.parse(image.dataset.imageCandidates || '[]');
            } catch (error) {
                candidates = [];
            }

            const nextIndex = Number(image.dataset.imageIndex || 0) + 1;
            if (candidates[nextIndex]) {
                image.dataset.imageIndex = String(nextIndex);
                image.src = candidates[nextIndex];
                return;
            }

            if (image.getAttribute('src') !== '/logo.png') {
                image.src = '/logo.png';
            }
        });
    });
}

function closeAdminSidebar() {
    document.querySelector('.cmd-sidebar')?.classList.remove('active');
    document.getElementById('adminSidebarBackdrop')?.classList.remove('active');
}

export function initAdminDashboard() {
    bindAdminUI();
    setupAdminPasswordModal();

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

            adminRole = getAdminRole(adminProfile);
            adminState = getAdminAssignedState(adminProfile);

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
    const idCardSearch = document.getElementById('idCardSearch');
    const idCardStateFilter = document.getElementById('idCardStateFilter');
    const idCardDeptFilter = document.getElementById('idCardDeptFilter');
    const idCardRankFilter = document.getElementById('idCardRankFilter');
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
    const badgeSourceRadios = document.querySelectorAll('input[name="badgeSource"]');

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
    [idCardSearch, idCardStateFilter, idCardDeptFilter, idCardRankFilter].forEach((el) => {
        if (el) el.addEventListener('input', renderIdCardCenter);
        if (el && el.tagName === 'SELECT') el.addEventListener('change', renderIdCardCenter);
    });

    if (exportBtn) exportBtn.addEventListener('click', exportRegistryCsv);
    if (mobileToggle) {
        let backdrop = document.getElementById('adminSidebarBackdrop');
        if (!backdrop) {
            backdrop = document.createElement('button');
            backdrop.type = 'button';
            backdrop.id = 'adminSidebarBackdrop';
            backdrop.className = 'admin-sidebar-backdrop';
            backdrop.setAttribute('aria-label', 'Close admin sidebar');
            document.body.appendChild(backdrop);
        }

        mobileToggle.addEventListener('click', () => {
            const sidebar = document.querySelector('.cmd-sidebar');
            const isOpen = sidebar?.classList.toggle('active');
            backdrop.classList.toggle('active', Boolean(isOpen));
        });

        backdrop.addEventListener('click', closeAdminSidebar);
        window.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') closeAdminSidebar();
        });
    }
    if (createCourseBtn) createCourseBtn.addEventListener('click', initCourseModal);
    if (newAdminBtn) newAdminBtn.addEventListener('click', () => openModal('adminModal'));
    if (editForm) editForm.addEventListener('submit', submitPersonnelUpdate);
    if (courseForm) courseForm.addEventListener('submit', submitCourse);
    if (adminForm) adminForm.addEventListener('submit', submitAdmin);
    if (targetState) targetState.addEventListener('change', (e) => populateTargetAreas(e.target.value));
    badgeSourceRadios.forEach((radio) => {
        radio.addEventListener('change', updateBadgeSourceFields);
    });

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

function updateBadgeSourceFields() {
    const source = document.querySelector('input[name="badgeSource"]:checked')?.value || 'link';
    const linkField = document.getElementById('badgeLinkField');
    const uploadField = document.getElementById('badgeUploadField');
    const linkInput = document.getElementById('cBadge');
    const fileInput = document.getElementById('cBadgeFile');
    const isEditing = Boolean(document.getElementById('courseId')?.value);

    if (linkField) linkField.style.display = source === 'link' ? 'block' : 'none';
    if (uploadField) uploadField.style.display = source === 'upload' ? 'block' : 'none';
    if (linkInput) linkInput.required = false;
    if (fileInput) fileInput.required = source === 'upload' && !isEditing;
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
        const displayName = getAdminDisplayName(adminData, user);
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
                    <button class="nav-btn" type="button" data-section="idcards"><i class="fa-solid fa-id-card"></i><span>ID Cards</span></button>
                    <button class="nav-btn" type="button" data-section="graduation"><i class="fa-solid fa-file-signature"></i><span>Graduation</span></button>
                    <button class="nav-btn" type="button" data-section="resets"><i class="fa-solid fa-key"></i><span>Security Hub</span></button>
                    <div class="nav-group" id="superAdminTools" style="display: ${showSuper ? 'block' : 'none'};">
                        <label>HQ Control</label>
                        <button class="nav-btn" type="button" data-section="courses"><i class="fa-solid fa-book"></i><span>Publisher</span></button>
                        <button class="nav-btn" type="button" data-section="admins"><i class="fa-solid fa-shield-halved"></i><span>Admins</span></button>
                    </div>
                </nav>
                <div class="sidebar-bottom">
                    <button class="action-btn-outline" type="button" onclick="window.openAdminSecurity()"><i class="fa-solid fa-lock"></i> Password</button>
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

    closeAdminSidebar();
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
    const recruitTbody = document.getElementById('recruitTableBody');
    if (recruitTbody) {
        recruitTbody.innerHTML = '<tr><td colspan="7" class="text-center">Syncing Registry...</td></tr>';
    }

    try {
        const res = await fetch(`${SCRIPT_URL}?action=getAdminData`);
        const payload = await res.json();
        let data = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];

        if (adminRole === 'state' && adminState) {
            data = data.filter((o) => (o["State Command"] || "").trim() === adminState);
        }

        allOfficers = data;
        filteredRegistry = data;
        populateFilters(allOfficers);
        renderRegistryTables(allOfficers);
        renderIdCardCenter();
        updateKpis(allOfficers);
    } catch (error) {
        console.error('Registry load failed:', error);
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">Connection error while loading registry.</td></tr>';
        }
        if (recruitTbody) {
            recruitTbody.innerHTML = '<tr><td colspan="7" class="text-center">Connection error while loading registry.</td></tr>';
        }
    }
}

function isRecruitRecord(officer = {}) {
    const category = String(officer["Member Category"] || officer["Registration Type"] || '').trim().toLowerCase();
    const id = String(officer["Unique ID"] || officer["Service Number"] || '');
    return category === 'recruit' || id.startsWith('REC/');
}

function setRegistryCount(id, count) {
    const node = document.getElementById(id);
    if (node) node.textContent = `${count} ${count === 1 ? 'record' : 'records'}`;
}

function renderRegistryTables(data) {
    const recruits = data.filter(isRecruitRecord);
    const members = data.filter((officer) => !isRecruitRecord(officer));

    renderTable(members, 'adminTableBody', 'member');
    renderTable(recruits, 'recruitTableBody', 'recruit');
    setRegistryCount('memberTableCount', members.length);
    setRegistryCount('recruitTableCount', recruits.length);
}

function renderTable(data, tbodyId = 'adminTableBody', tableType = 'member') {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    if (!data.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center">No ${tableType === 'recruit' ? 'recruits' : 'members'} found.</td></tr>`;
        return;
    }

    tbody.innerHTML = [...data].reverse().map((o) => {
        const uniqueId = o["Unique ID"] || o["Service Number"] || 'N/A';
        const serviceNumber = o["Service Number"] || '';
        const safeUniqueId = String(uniqueId).replace(/'/g, "\\'");
        const safeServiceNumber = String(serviceNumber).replace(/'/g, "\\'");
        const name = `${o["Surname"] || ''}, ${o["First Name"] || ''}`.replace(/^,\s*/, '');
        const timestamp = o["Timestamp"] ? String(o["Timestamp"]).split('T')[0] : 'N/A';
        const isRecruit = tableType === 'recruit';
        const statusLabel = isRecruit ? (o["Registration Type"] || o["Status"] || 'Recruit') : (o["Rank"] || 'N/A');
        const statusClass = isRecruit ? 'badge-gold' : ((o["Rank"] || '').toLowerCase().includes('commander') ? 'badge-red' : 'badge-green');
        return `
            <tr>
                <td>${timestamp}</td>
                <td><code>${uniqueId}</code></td>
                <td><strong>${name}</strong></td>
                <td><span class="rank-badge ${statusClass}">${statusLabel}</span></td>
                <td>${o["Department"] || 'N/A'}</td>
                <td>${o["State Command"] || 'N/A'}</td>
                <td>
                    <div class="row-actions">
                        ${isRecruit ? '' : `<button class="action-icon" type="button" title="Edit officer" onclick="window.openEditModal('${safeUniqueId}')"><i class="fa-solid fa-user-pen"></i></button>`}
                        ${isRecruit ? '' : `<button class="action-icon" type="button" title="Generate ID card" onclick="window.generateIDCardById('${safeUniqueId}')"><i class="fa-solid fa-id-card"></i></button>`}
                        ${o["PDF URL"] ? `<a href="${o["PDF URL"]}" target="_blank" class="pdf-btn">PDF</a>` : `<button class="action-icon" type="button" title="View officer" onclick="window.viewOfficer('${safeUniqueId}')"><i class="fa-solid fa-eye"></i></button>`}
                        <button class="action-icon danger-icon" type="button" title="Delete officer" onclick="window.deleteOfficerRecord('${safeUniqueId}', '${safeServiceNumber}')"><i class="fa-solid fa-trash"></i></button>
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
    populateSelect('idCardStateFilter', [...new Set(data.map((o) => o["State Command"]).filter(Boolean))].sort(), 'States', adminRole === 'state' ? adminState : '');
    populateSelect('idCardDeptFilter', [...new Set(data.map((o) => o["Department"]).filter(Boolean))].sort(), 'Departments');
    populateSelect('idCardRankFilter', RANK_LIST, 'Ranks');
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

    filteredRegistry = filtered;
    renderRegistryTables(filtered);
    renderIdCardCenter();
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
                    <td>
                        <div class="row-actions">
                            <button class="cmd-btn-small" type="button" onclick="window.approveReset('${docSnap.id}', '${escapeInline(t.contactEmail)}', '${escapeInline(t.officerName)}', '${escapeInline(t.serviceNumber)}')">APPROVE & SEND</button>
                            <button class="cmd-btn-small danger-btn" type="button" onclick="window.declineReset('${docSnap.id}', '${escapeInline(t.officerName || t.serviceNumber)}')">DECLINE</button>
                        </div>
                    </td>
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
            const isDeclined = p.status === 'declined';
            const actionCell = isDeclined
                ? `<span class="rank-badge badge-red">DECLINED</span>`
                : (adminRole === 'super' || adminRole === 'national')
                    ? `<div class="row-actions">
                        <button class="cmd-btn-small" type="button" onclick="window.approvePromotion('${docSnap.id}', '${escapeInline(p.uniqueID)}', '${escapeInline(p.proposedRank)}')">APPROVE</button>
                        <button class="cmd-btn-small danger-btn" type="button" onclick="window.declinePromotion('${docSnap.id}', '${escapeInline(p.fullName || p.uniqueID)}')">DECLINE</button>
                    </div>`
                    : `<span class="rank-badge badge-red">PENDING HQ</span>`;
            rows.push(`
                <tr>
                    <td><b>${p.fullName || 'Unknown'}</b></td>
                    <td>${p.currentRank || 'N/A'}</td>
                    <td><span class="rank-badge ${isDeclined ? 'badge-red' : 'badge-gold'}">${p.proposedRank || 'N/A'}</span></td>
                    <td>${p.state || 'N/A'}</td>
                    <td>${actionCell}</td>
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
            const isDeclined = d.status === 'declined';
            const statusClass = isDone ? 'badge-green' : isDeclined ? 'badge-gold' : 'badge-red';
            const actionCell = isDone
                ? 'Awarded'
                : isDeclined
                    ? 'Declined'
                    : `<div class="row-actions">
                        <button class="cmd-btn-small" type="button" onclick="window.updateEnrollment('${docSnap.id}', 'completed')">APPROVE</button>
                        <button class="cmd-btn-small danger-btn" type="button" onclick="window.updateEnrollment('${docSnap.id}', 'declined')">DECLINE</button>
                    </div>`;
            rows.push(`
                <tr>
                    <td><b>${d.fullName || 'Unknown'}</b></td>
                    <td>${d.courseTitle || 'N/A'}</td>
                    <td>${d.dateApplied?.toDate?.().toLocaleDateString?.() || 'N/A'}</td>
                    <td><span class="rank-badge ${statusClass}">${d.status || 'pending'}</span></td>
                    <td>${actionCell}</td>
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
                    <td><b>${getAdminDisplayName(a)}</b></td>
                    <td>${getAdminAssignedState(a) || 'National'}</td>
                    <td>${getAdminRole(a) || 'state'}</td>
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
        allCourses = [];
        snap.forEach((docSnap) => {
            const c = { id: docSnap.id, ...docSnap.data() };
            allCourses.push(c);
            const safeId = String(docSnap.id).replace(/'/g, "\\'");
            const badgeSource = c.badgeUrl || '';
            cards.push(`
                <div class="course-card">
                    <div class="admin-course-badge">
                        ${createAdminImageMarkup(badgeSource, c.title || 'Course badge')}
                    </div>
                    <small>Rank Req: ${c.minRankLevel || 'N/A'}</small>
                    <h4>${c.title || 'Untitled Course'}</h4>
                    <p>${c.description || 'No description added yet.'}</p>
                    <div class="course-card-actions">
                        <button class="cmd-btn-small" type="button" onclick="window.openCourseEditor('${safeId}')">EDIT</button>
                        <button class="cmd-btn-small danger-btn" type="button" onclick="window.deleteCourse('${safeId}')">REMOVE</button>
                    </div>
                </div>
            `);
        });
        grid.innerHTML = cards.length ? cards.join('') : '<div class="placeholder-surface"><h3>No courses published</h3><p>Create your first course from the button above.</p></div>';
        wireAdminImages(grid);
    } catch (error) {
        grid.innerHTML = '<div class="placeholder-surface"><h3>Publisher unavailable</h3><p>Unable to load course data right now.</p></div>';
    }
}

function getIdCardOfficerList() {
    const base = Array.isArray(filteredRegistry) ? filteredRegistry : allOfficers;
    const searchTerm = (document.getElementById('idCardSearch')?.value || '').trim().toLowerCase();
    const selectedState = document.getElementById('idCardStateFilter')?.value || '';
    const selectedDept = document.getElementById('idCardDeptFilter')?.value || '';
    const selectedRank = document.getElementById('idCardRankFilter')?.value || '';

    return base.filter((officer) => {
        if (isRecruitRecord(officer)) return false;

        const haystack = [
            getOfficerName(officer),
            officer["Service Number"],
            officer["Unique ID"],
            officer["Rank"],
            officer["Department"],
            officer["State Command"],
            officer["Area Command"]
        ].filter(Boolean).join(' ').toLowerCase();

        return (!searchTerm || haystack.includes(searchTerm))
            && (!selectedState || officer["State Command"] === selectedState)
            && (!selectedDept || officer["Department"] === selectedDept)
            && (!selectedRank || officer["Rank"] === selectedRank);
    });
}

function renderIdCardCenter() {
    const tbody = document.getElementById('idCardListBody');
    const count = document.getElementById('idCardCount');
    if (!tbody) return;

    const officers = getIdCardOfficerList();
    if (count) count.textContent = `${officers.length} ${officers.length === 1 ? 'card' : 'cards'}`;

    if (!officers.length) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center">No officers match these ID card filters.</td></tr>';
        return;
    }

    tbody.innerHTML = officers.map((officer) => {
        const id = officer["Unique ID"] || officer["Service Number"] || '';
        const serviceNumber = officer["Service Number"] || 'N/A';
        const name = getOfficerName(officer);
        return `
            <tr>
                <td><div class="cell-stack"><b>${name}</b><small>${officer["Email"] || officer.email || 'No email'}</small></div></td>
                <td><code>${serviceNumber}</code></td>
                <td><span class="rank-badge badge-green">${officer["Rank"] || 'Officer'}</span></td>
                <td>${officer["Department"] || 'N/A'}</td>
                <td>${officer["State Command"] || 'N/A'}</td>
                <td><button class="cmd-btn-small" type="button" onclick="window.generateIDCardById('${escapeInline(id)}')"><i class="fa-solid fa-id-card"></i> ID CARD</button></td>
            </tr>
        `;
    }).join('');
}

window.generateIDCard = generateFormattedIDCard;

window.generateIDCardById = async (officerId) => {
    const officer = allOfficers.find((item) => (item["Unique ID"] || item["Service Number"]) === officerId);
    if (!officer) return alert("Officer record not found.");
    try {
        return await generateFormattedIDCard({
            ...officer,
            authoritySignatureUrl: getAuthoritySignature(adminProfile)
        });
    } catch (error) {
        console.error('ID card preview failed:', error);
        alert(error.message || "Unable to open ID card preview.");
        return null;
    }
};

window.downloadOfficerIdCard = window.generateIDCardById;

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

async function getOfficerUserDocId(officer = {}, fallbackId = '') {
    const uniqueID = officer["Unique ID"] || officer.uniqueID || '';
    const serviceNumber = officer["Service Number"] || officer.serviceNumber || '';

    if (uniqueID) {
        const uniqueSnap = await getDocs(query(collection(db, "users"), where("uniqueID", "==", uniqueID)));
        if (!uniqueSnap.empty) return uniqueSnap.docs[0].id;
    }

    if (serviceNumber) {
        const serviceSnap = await getDocs(query(collection(db, "users"), where("serviceNumber", "==", serviceNumber)));
        if (!serviceSnap.empty) return serviceSnap.docs[0].id;
    }

    return String(uniqueID || fallbackId || serviceNumber || `officer-${Date.now()}`).replace(/[\/#?]/g, '-');
}

async function submitPersonnelUpdate(e) {
    e.preventDefault();
    const uid = document.getElementById('editUid')?.value;
    const officer = allOfficers.find((o) => (o["Unique ID"] || o["Service Number"]) === uid);
    if (!uid || !officer) return;

    const newRank = document.getElementById('editRank')?.value || '';
    const payload = {
        phone: document.getElementById('editPhone')?.value || '',
        email: document.getElementById('editEmail')?.value || '',
        address: document.getElementById('editAddress')?.value || '',
        nokName: document.getElementById('editNokName')?.value || '',
        nokRelation: document.getElementById('editNokRelation')?.value || '',
        nokPhone: document.getElementById('editNokPhone')?.value || '',
        postHeld: document.getElementById('editPost')?.value || '',
        department: document.getElementById('editDept')?.value || ''
    };
    const sheetPayload = {
        action: "updateOfficerProfile",
        uniqueID: officer["Unique ID"] || "",
        serviceNumber: officer["Service Number"] || "",
        phone: payload.phone,
        email: payload.email,
        address: payload.address,
        nokName: payload.nokName,
        nokRelation: payload.nokRelation,
        nokPhone: payload.nokPhone,
        postHeld: payload.postHeld,
        department: payload.department
    };

    try {
        const docId = await getOfficerUserDocId(officer, uid);

        if (adminRole === 'super' || adminRole === 'national') {
            await setDoc(doc(db, "users", docId), { ...payload, rank: newRank }, { merge: true });
            await postScriptAction({ ...sheetPayload, rank: newRank });
            alert("Record updated.");
        } else {
            await setDoc(doc(db, "users", docId), payload, { merge: true });
            await postScriptAction(sheetPayload);
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

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const badgeSource = document.querySelector('input[name="badgeSource"]:checked')?.value || 'link';
    const courseId = document.getElementById('courseId')?.value || '';
    const isEditing = Boolean(courseId);
    let badgeUrl = document.getElementById('cBadge')?.value || '';

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = badgeSource === 'upload' ? 'Uploading Badge...' : isEditing ? 'Updating Course...' : 'Deploying Course...';
    }

    const payload = {
        title: document.getElementById('cTitle')?.value || '',
        description: document.getElementById('cDesc')?.value || '',
        minRankLevel: document.getElementById('cRank')?.value || '',
        badgeUrl,
        eligibleDepts: getCheckedValues('eligibleDepts'),
        eligibleStates: getCheckedValues('eligibleStates'),
        updatedAt: serverTimestamp()
    };

    if (!isEditing) payload.createdAt = serverTimestamp();

    try {
        if (badgeSource === 'upload') {
            const file = document.getElementById('cBadgeFile')?.files?.[0];
            if (!file && !isEditing) throw new Error("Select a badge image to upload.");

            if (file) {
                if (!file.type.startsWith('image/')) throw new Error("Badge upload must be an image file.");
                if (file.size > 5242880) throw new Error("Badge image must be 5MB or smaller.");
                payload.badgeUrl = await uploadCourseBadge(file);
            } else {
                payload.badgeUrl = allCourses.find((course) => course.id === courseId)?.badgeUrl || '';
            }
        }

        if (isEditing) {
            await updateDoc(doc(db, "courses", courseId), payload);
        } else {
            await addDoc(collection(db, "courses"), payload);
        }

        alert(isEditing ? "Course updated." : "Course deployed.");
        closeModal('courseModal');
        resetCourseForm();
        await loadCourseManager();
    } catch (error) {
        console.error(error);
        alert(error.message || "Unable to deploy course.");
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = isEditing ? 'Update Course' : 'Deploy Course';
        }
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

function getCheckedValues(name) {
    return [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((el) => el.value);
}

function updateMultiDropdownSummary(name, summaryId, fallback) {
    const summary = document.getElementById(summaryId);
    if (!summary) return;

    const count = getCheckedValues(name).length;
    summary.textContent = count ? `${count} selected` : fallback;
}

function populateCourseSelectors(selectedDepts = [], selectedStates = []) {
    const cRank = document.getElementById('cRank');
    if (cRank && cRank.options.length <= 1) {
        cRank.innerHTML = '<option value="">Select Rank Level</option>';
        RANK_LIST.forEach((rank, index) => cRank.add(new Option(rank, String(index + 1))));
    }

    const deptList = document.getElementById('cDeptsList');
    if (deptList) {
        deptList.innerHTML = DEPT_LIST.map((dept) => `
            <label class="check-item"><input type="checkbox" name="eligibleDepts" value="${dept}" ${selectedDepts.includes(dept) ? 'checked' : ''}> ${dept}</label>
        `).join('');
        deptList.querySelectorAll('input[name="eligibleDepts"]').forEach((input) => {
            input.addEventListener('change', () => updateMultiDropdownSummary('eligibleDepts', 'cDeptsSummary', 'Departments'));
        });
    }

    const stateList = document.getElementById('cStatesList');
    if (stateList) {
        const states = [...new Set([
            ...allOfficers.map((item) => item["State Command"]).filter(Boolean),
            ...selectedStates
        ])].sort();
        stateList.innerHTML = states.map((state) => `
            <label class="check-item"><input type="checkbox" name="eligibleStates" value="${state}" ${selectedStates.includes(state) ? 'checked' : ''}> ${state}</label>
        `).join('');
        stateList.querySelectorAll('input[name="eligibleStates"]').forEach((input) => {
            input.addEventListener('change', () => updateMultiDropdownSummary('eligibleStates', 'cStatesSummary', 'States'));
        });
    }

    updateMultiDropdownSummary('eligibleDepts', 'cDeptsSummary', 'Departments');
    updateMultiDropdownSummary('eligibleStates', 'cStatesSummary', 'States');
}

function resetCourseForm() {
    document.getElementById('courseForm')?.reset();
    document.getElementById('courseId').value = '';
    document.getElementById('courseModalTitle').textContent = 'Publish New Course';
    document.getElementById('courseSubmitBtn').textContent = 'Deploy Course';
    const linkSource = document.querySelector('input[name="badgeSource"][value="link"]');
    if (linkSource) linkSource.checked = true;
    populateCourseSelectors();
    updateBadgeSourceFields();
}

function initCourseModal() {
    resetCourseForm();
    openModal('courseModal');
}

window.openCourseEditor = (courseId) => {
    const course = allCourses.find((item) => item.id === courseId);
    if (!course) return;

    resetCourseForm();
    document.getElementById('courseId').value = courseId;
    document.getElementById('courseModalTitle').textContent = 'Edit Course';
    document.getElementById('courseSubmitBtn').textContent = 'Update Course';
    document.getElementById('cTitle').value = course.title || '';
    document.getElementById('cDesc').value = course.description || '';
    document.getElementById('cRank').value = course.minRankLevel || '';
    document.getElementById('cBadge').value = course.badgeUrl || '';
    populateCourseSelectors(course.eligibleDepts || [], course.eligibleStates || []);
    updateBadgeSourceFields();
    openModal('courseModal');
};

window.openEditModal = (uid) => {
    const officer = allOfficers.find((o) => (o["Unique ID"] || o["Service Number"]) === uid);
    if (!officer) return;

    document.getElementById('editUid').value = uid;
    document.getElementById('editFullName').value = getOfficerName(officer);
    document.getElementById('editServiceNumber').value = officer["Service Number"] || 'N/A';
    document.getElementById('editUniqueId').value = officer["Unique ID"] || 'N/A';
    document.getElementById('editCommand').value = [officer["State Command"], officer["Area Command"]].filter(Boolean).join(' / ') || 'N/A';
    document.getElementById('editPhone').value = officer["Phone Number"] || officer.phone || '';
    document.getElementById('editEmail').value = officer["Email"] || officer.email || '';
    document.getElementById('editAddress').value = officer["Residential Address"] || officer.address || '';
    document.getElementById('editNokName').value = officer["NOK Full Name"] || officer.nokName || '';
    document.getElementById('editNokRelation').value = officer["NOK Relationship"] || officer["NOK relationship"] || officer.nokRelation || '';
    document.getElementById('editNokPhone').value = officer["NOK Phone Number"] || officer.nokPhone || '';
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

async function deleteUserDocsForOfficer(officer) {
    const uniqueID = officer["Unique ID"] || "";
    const serviceNumber = officer["Service Number"] || "";
    const matches = [];

    if (uniqueID) {
        const uniqueSnap = await getDocs(query(collection(db, "users"), where("uniqueID", "==", uniqueID)));
        matches.push(...uniqueSnap.docs);
    }

    if (serviceNumber) {
        const serviceSnap = await getDocs(query(collection(db, "users"), where("serviceNumber", "==", serviceNumber)));
        matches.push(...serviceSnap.docs);
    }

    const seen = new Set();
    await Promise.all(matches.filter((docSnap) => {
        if (seen.has(docSnap.id)) return false;
        seen.add(docSnap.id);
        return true;
    }).map((docSnap) => deleteDoc(doc(db, "users", docSnap.id))));
}

window.deleteOfficerRecord = async (uniqueId, serviceNumber = '') => {
    const officer = allOfficers.find((item) => {
        return (item["Unique ID"] || item["Service Number"]) === uniqueId
            || (serviceNumber && item["Service Number"] === serviceNumber);
    });
    if (!officer) return alert("Officer record not found.");

    if (adminRole === 'state' && adminState && officer["State Command"] !== adminState) {
        return alert("You can only delete records under your assigned state command.");
    }

    const name = `${officer["Surname"] || ''} ${officer["First Name"] || ''}`.trim() || uniqueId;
    const idLabel = officer["Service Number"] || officer["Unique ID"] || uniqueId;
    if (!confirm(`Delete ${name} (${idLabel}) from the registry? This cannot be undone.`)) return;

    try {
        await postScriptAction({
            action: "deleteOfficerRecord",
            uniqueID: officer["Unique ID"] || "",
            serviceNumber: officer["Service Number"] || "",
            state: officer["State Command"] || ""
        });

        try {
            await deleteUserDocsForOfficer(officer);
        } catch (firestoreError) {
            console.warn("Firestore profile cleanup failed:", firestoreError);
        }

        alert("Officer record deleted.");
        await fetchRegistry();
    } catch (error) {
        console.error(error);
        alert(error.message || "Unable to delete officer record.");
    }
};

window.updateEnrollment = async (id, status) => {
    if (status === 'declined' && !confirm("Decline this training application?")) return;
    await updateDoc(doc(db, "enrollments", id), {
        status,
        reviewedAt: serverTimestamp(),
        reviewedBy: auth.currentUser?.uid || ''
    });
    await loadEnrollments();
};

window.declineReset = async (ticketId, label = '') => {
    if (!confirm(`Decline this security request${label ? ` for ${label}` : ''}?`)) return;
    await updateDoc(doc(db, "password_resets", ticketId), {
        status: "declined",
        declinedAt: serverTimestamp(),
        declinedBy: auth.currentUser?.uid || ''
    });
    await loadResetTickets();
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
    await postScriptAction({ action: "updateOfficerProfile", uniqueID: officerID, rank: newRank });
    await deleteDoc(doc(db, "promotion_queue", queueId));
    await Promise.all([loadPromotions(), fetchRegistry()]);
};

window.declinePromotion = async (queueId, label = '') => {
    if (!confirm(`Decline this promotion recommendation${label ? ` for ${label}` : ''}?`)) return;
    await updateDoc(doc(db, "promotion_queue", queueId), {
        status: "declined",
        declinedAt: serverTimestamp(),
        declinedBy: auth.currentUser?.uid || ''
    });
    await loadPromotions();
};

window.approveReset = async (ticketId, email, name, serviceNo) => {
    const targetEmail = String(email || '').trim();
    if (!targetEmail) {
        alert("No recovery email is attached to this request.");
        return;
    }

    if (!confirm(`Restore access for ${name}? \nA temporary password will be sent to ${targetEmail}.`)) return;

    const tempPass = "CAD-" + Math.random().toString(36).slice(-5).toUpperCase();
    try {
        const apiUrl = `${SCRIPT_URL}?action=sendResetInstructions&email=${encodeURIComponent(targetEmail)}&name=${encodeURIComponent(name)}&serviceNo=${encodeURIComponent(serviceNo)}&tempPass=${tempPass}`;
        const response = await fetch(apiUrl);
        const result = await response.json();

        if (result.status === "success") {
            await updateDoc(doc(db, "password_resets", ticketId), {
                status: "resolved",
                tempPasswordUsed: tempPass,
                resolvedAt: serverTimestamp(),
                deliveredTo: targetEmail
            });
            alert(`Success! Officer ${name} has been sent temporary credentials at ${targetEmail}.`);
            await loadResetTickets();
        } else {
            throw new Error(result.message || 'Unknown reset error');
        }
    } catch (error) {
        console.error("Restore Error:", error);
        alert(error.message || "Failed to restore access.");
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
            await updateTransferredOfficerLocation(sn, newState, newArea, result.pdfUrl || "");
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

async function updateTransferredOfficerLocation(serviceNumber, stateCommand, areaCommand, pdfUrl = "") {
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
    if (pdfUrl) {
        updates.pdfUrl = pdfUrl;
        updates["PDF URL"] = pdfUrl;
    }

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
    const exportData = Array.isArray(filteredRegistry) ? filteredRegistry : allOfficers;
    if (!exportData.length) return;

    const rows = [
        ['Timestamp', 'Category', 'Service Number', 'Unique ID', 'Surname', 'First Name', 'Rank', 'Department', 'State Command'],
        ...exportData.map((o) => [
            o["Timestamp"] || '',
            o["Member Category"] || '',
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
