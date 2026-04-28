import { auth, db } from '../config.js';
import { onAuthStateChanged, updatePassword, reauthenticateWithCredential, EmailAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { doc, getDoc, collection, getDocs, query, where, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { setupSidebar } from '../components/Sidebar.js';

const rankMapping = {
    "Private": 1, "Lance Corporal": 2, "Corporal": 3, "Sergeant": 4, "Staff Sergeant": 5,
    "Assistant Inspector": 6, "Deputy Inspector": 7, "Inspector": 8, "Assistant Superintendent II": 9,
    "Assistant Superintendent I": 10, "Deputy Superintendent": 11, "Superintendent": 12,
    "Chief Superintendent": 13, "Assistant Commander": 14, "Deputy Commander": 15,
    "Commander": 16, "Assistant Brigade Commander": 17, "Deputy Brigade Commander": 18, "Brigade Commander": 19
};

let currentOfficer = null;

function getDirectDriveLink(url) {
    if (!url || url === "N/A" || !url.includes("drive.google.com")) return "/logo.png";
    const driveId = url.match(/[-\w]{25,}/);
    return driveId ? `https://drive.google.com/thumbnail?id=${driveId[0]}&sz=w500` : "/logo.png";
}

function setDashboardVisible(isVisible) {
    const loader = document.getElementById('authGuardLoader');
    const wrapper = document.getElementById('dashboardWrapper');
    if (loader) loader.style.display = isVisible ? 'none' : 'flex';
    if (wrapper) wrapper.style.display = isVisible ? 'flex' : 'none';
}

function populateProfile(data) {
    const setText = (id, value, fallback = 'N/A') => {
        const node = document.getElementById(id);
        if (node) node.innerText = value || fallback;
    };

    setText('serviceNumDisplay', `Service Number: ${data.serviceNumber || 'N/A'}`, '');
    setText('dataState', data.state);
    setText('dataArea', data.area);
    setText('dataDept', data.department);
    setText('dataPost', data.postHeld || "Member");
    setText('dataPhone', data.phone);
    setText('dataEmail', data.email);

    const details = [
        { label: "Full Name", value: `${data.firstName || ''} ${data.otherName || ''} ${data.surname || ''}`.replace(/\s+/g, ' ').trim() || 'N/A' },
        { label: "Address", value: data.address || 'N/A' },
        { label: "Next of Kin", value: data.nokName ? `${data.nokName} (${data.nokRelation || 'N/A'})` : 'N/A' },
        { label: "Unique ID", value: data.uniqueID || 'N/A' }
    ];

    const list = document.getElementById('detailsList');
    if (list) {
        list.innerHTML = details.map((detail) => `
            <div class="detail-item">
                <span class="label">${detail.label}</span>
                <span class="value">${detail.value}</span>
            </div>
        `).join('');
    }
}

async function loadLMS() {
    const grid = document.getElementById('courseGrid');
    const badgeGallery = document.getElementById('badgeGallery');
    if (!grid || !badgeGallery || !currentOfficer || !auth.currentUser) return;

    grid.innerHTML = '<div class="panel-placeholder">Syncing course catalog...</div>';
    badgeGallery.innerHTML = '<p class="empty-msg">Checking your earned badges...</p>';

    try {
        const [coursesSnap, enrollSnap] = await Promise.all([
            getDocs(collection(db, "courses")),
            getDocs(query(collection(db, "enrollments"), where("officerUID", "==", auth.currentUser.uid)))
        ]);

        const myEnrollments = {};
        enrollSnap.forEach((docSnap) => {
            const data = docSnap.data();
            myEnrollments[data.courseID] = { id: docSnap.id, ...data };
        });

        grid.innerHTML = "";
        badgeGallery.innerHTML = "";

        coursesSnap.forEach((courseDoc) => {
            const course = courseDoc.data();
            const enroll = myEnrollments[courseDoc.id];
            const officerLvl = rankMapping[currentOfficer.rank] || 0;
            const requiredLevel = Number(course.minRankLevel || 1);
            const isUnlocked = officerLvl >= requiredLevel;
            const isDeptEligible = !course.eligibleDepts?.length || course.eligibleDepts.includes(currentOfficer.department);
            const isStateEligible = !course.eligibleStates?.length || course.eligibleStates.includes(currentOfficer.state);
            const isEligible = isUnlocked && isDeptEligible && isStateEligible;

            const card = document.createElement('div');
            card.className = `course-card ${isEligible ? '' : 'locked'}`;

            let actionBtn = isEligible
                ? `<button class="course-btn btn-register" type="button" onclick="window.enroll('${courseDoc.id}', '${String(course.title || 'Course').replace(/'/g, "\\'")}')">Enroll Now</button>`
                : `<button class="course-btn" type="button" disabled>Locked</button>`;

            if (enroll) {
                if (enroll.status === 'completed') {
                    actionBtn = enroll.certificateUrl
                        ? `<button class="course-btn btn-completed" type="button" onclick="window.open('${enroll.certificateUrl}', '_blank', 'noopener')">Certificate</button>`
                        : `<button class="course-btn btn-completed" type="button" disabled>Completed</button>`;

                    badgeGallery.innerHTML += `
                        <div class="earned-badge active">
                            <div class="badge-icon"><img src="${getDirectDriveLink(course.badgeUrl)}" alt="${course.title || 'Badge'}"></div>
                            <span>${course.title || 'Course Badge'}</span>
                        </div>
                    `;
                } else {
                    actionBtn = `<button class="course-btn btn-pending" type="button" disabled>Processing</button>`;
                }
            }

            card.innerHTML = `
                <div class="badge-preview"><img src="${getDirectDriveLink(course.badgeUrl)}" alt="${course.title || 'Course badge'}"></div>
                <h4>${course.title || 'Untitled Course'}</h4>
                <p>${course.description || 'No course description available yet.'}</p>
                <div class="course-meta">
                    <span class="rank-tag">Req: Lvl ${requiredLevel}</span>
                    ${actionBtn}
                </div>
            `;
            grid.appendChild(card);
        });

        if (!grid.children.length) {
            grid.innerHTML = '<div class="panel-placeholder">No courses published yet.</div>';
        }

        if (!badgeGallery.children.length) {
            badgeGallery.innerHTML = '<p class="empty-msg">No badges earned yet.</p>';
        }
    } catch (error) {
        console.error("LMS Sync Error", error);
        grid.innerHTML = '<div class="panel-placeholder">Unable to load course catalog right now.</div>';
        badgeGallery.innerHTML = '<p class="empty-msg">Badge records are unavailable.</p>';
    }
}

function updateActiveSidebarTab(tab) {
    document.querySelectorAll('.side-nav .nav-item[data-tab-target]').forEach((button) => {
        button.classList.toggle('active', button.dataset.tabTarget === tab);
    });
}

function setupTabListeners() {
    window.switchTab = (tab) => {
        document.querySelectorAll('.tab-content').forEach((panel) => {
            panel.style.display = panel.id === `section-${tab}` ? 'block' : 'none';
        });

        const pageTitle = document.getElementById('pageTitle');
        if (pageTitle) {
            pageTitle.innerText = tab === 'lms' ? "Learning Center" : "Personnel Dashboard";
        }

        updateActiveSidebarTab(tab);

        if (tab === 'lms') {
            const rankNode = document.getElementById('lmsRank');
            if (rankNode) rankNode.innerText = currentOfficer?.rank || 'N/A';
            loadLMS();
        }

        document.getElementById('sidebar')?.classList.remove('active');
    };
}

function setupSidebarToggle() {
    const toggle = document.getElementById('sidebarToggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
        document.getElementById('sidebar')?.classList.toggle('active');
    });
}

function setupSecurityModal() {
    const modal = document.getElementById('securityModal');
    const closeBtn = document.getElementById('closeSecurityBtn');
    const updateBtn = document.getElementById('updatePasswordBtn');
    const msg = document.getElementById('securityMsg');

    window.openSecurity = () => {
        if (!modal) return;
        modal.style.display = 'flex';
        if (msg) {
            msg.style.display = 'none';
            msg.textContent = '';
        }
    };

    const closeSecurity = () => {
        if (modal) modal.style.display = 'none';
    };

    if (closeBtn) closeBtn.addEventListener('click', closeSecurity);
    if (modal) {
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeSecurity();
        });
    }

    if (updateBtn) {
        updateBtn.addEventListener('click', async () => {
            const currentPassword = document.getElementById('currentPassword')?.value || '';
            const newPassword = document.getElementById('newPassword')?.value || '';
            const user = auth.currentUser;

            if (!user || !user.email) return;

            if (!currentPassword || !newPassword) {
                if (msg) {
                    msg.style.display = 'block';
                    msg.textContent = 'Enter both your current and new password.';
                }
                return;
            }

            updateBtn.disabled = true;
            try {
                const credential = EmailAuthProvider.credential(user.email, currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPassword);

                if (msg) {
                    msg.style.display = 'block';
                    msg.textContent = 'Password updated successfully.';
                }

                document.getElementById('currentPassword').value = '';
                document.getElementById('newPassword').value = '';
            } catch (error) {
                console.error('Password update failed:', error);
                if (msg) {
                    msg.style.display = 'block';
                    msg.textContent = 'Unable to update password. Please confirm your current password.';
                }
            } finally {
                updateBtn.disabled = false;
            }
        });
    }
}

window.enroll = async (courseId, courseTitle) => {
    if (!auth.currentUser || !currentOfficer) return;

    const duplicateQuery = query(
        collection(db, "enrollments"),
        where("officerUID", "==", auth.currentUser.uid),
        where("courseID", "==", courseId)
    );

    try {
        const existing = await getDocs(duplicateQuery);
        if (!existing.empty) {
            alert("You already have an active enrollment for this course.");
            return;
        }

        await addDoc(collection(db, "enrollments"), {
            officerUID: auth.currentUser.uid,
            officerEmail: auth.currentUser.email || '',
            fullName: `${currentOfficer.surname || ''} ${currentOfficer.firstName || ''}`.trim(),
            uniqueID: currentOfficer.uniqueID || '',
            serviceNumber: currentOfficer.serviceNumber || '',
            state: currentOfficer.state || '',
            department: currentOfficer.department || '',
            rank: currentOfficer.rank || '',
            courseID: courseId,
            courseTitle,
            status: 'pending',
            dateApplied: serverTimestamp()
        });

        alert(`Enrollment request sent for ${courseTitle}.`);
        loadLMS();
    } catch (error) {
        console.error('Enrollment failed:', error);
        alert("Unable to submit enrollment right now.");
    }
};

export function initDashboard() {
    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.replace('/login.html');
            return;
        }

        try {
            const docSnap = await getDoc(doc(db, "users", user.uid));
            if (!docSnap.exists()) {
                window.location.replace('/recruit-reg.html');
                return;
            }

            currentOfficer = docSnap.data();
            setupSidebar(currentOfficer, 'profile');
            populateProfile(currentOfficer);
            setupTabListeners();
            setupSidebarToggle();
            setupSecurityModal();
            setDashboardVisible(true);
        } catch (error) {
            console.error("Dashboard Sync Error:", error);
            setDashboardVisible(false);
        }
    });
}
