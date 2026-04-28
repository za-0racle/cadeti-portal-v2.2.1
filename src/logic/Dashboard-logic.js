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

const COURSE_BADGE_OVERRIDES = {
    "forge of leaders course": "https://drive.google.com/file/d/1E_tn9eWWUg3JZa3VoNdyFtkeM2M14i55/view?usp=sharing",
    "forge of leaders": "https://drive.google.com/file/d/1vcd6tHat_hxVb31HQs268YvYbxSxa8-K/view?usp=sharing",
    "leadership & command fundamentals": "https://drive.google.com/file/d/1LW8fcCR9neQFcfxE8xUzkREEdRkdC8kp/view?usp=sharing",
    "leadership development course": "https://drive.google.com/file/d/170Ba_xhxUTSZt8PGrlMf0iR0QCDUixR5/view?usp=sharing"
};

const FALLBACK_BADGE_POOL = [
    "https://drive.google.com/file/d/1E_tn9eWWUg3JZa3VoNdyFtkeM2M14i55/view?usp=sharing",
    "https://drive.google.com/file/d/1vcd6tHat_hxVb31HQs268YvYbxSxa8-K/view?usp=sharing",
    "https://drive.google.com/file/d/1LW8fcCR9neQFcfxE8xUzkREEdRkdC8kp/view?usp=sharing",
    "https://drive.google.com/file/d/170Ba_xhxUTSZt8PGrlMf0iR0QCDUixR5/view?usp=sharing"
];

function getCourseBadgeSource(course = {}, index = 0) {
    const normalizedTitle = String(course.title || '').trim().toLowerCase();
    if (COURSE_BADGE_OVERRIDES[normalizedTitle]) {
        return COURSE_BADGE_OVERRIDES[normalizedTitle];
    }

    return course.badgeUrl || FALLBACK_BADGE_POOL[index % FALLBACK_BADGE_POOL.length];
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

function getAssetImageCandidates(url) {
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

function createDashboardImageMarkup(url, alt, className = '') {
    const candidates = getAssetImageCandidates(url);
    const safeAlt = String(alt || 'Image').replace(/"/g, '&quot;');
    const imageClass = ['dashboard-image', className].filter(Boolean).join(' ');
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

function wireDashboardImages(root = document) {
    root.querySelectorAll('.dashboard-image').forEach((image) => {
        if (image.dataset.imageBound === 'true') return;
        image.dataset.imageBound = 'true';

        image.addEventListener('error', () => {
            let candidates = [];
            try {
                candidates = JSON.parse(image.dataset.imageCandidates || '[]');
            } catch (error) {
                candidates = [];
            }

            const currentIndex = Number(image.dataset.imageIndex || 0);
            const nextIndex = currentIndex + 1;

            if (candidates[nextIndex]) {
                image.dataset.imageIndex = String(nextIndex);
                image.src = candidates[nextIndex];
                return;
            }

            if (image.src !== window.location.origin + '/logo.png' && image.getAttribute('src') !== '/logo.png') {
                image.src = '/logo.png';
            }
        });
    });
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

        let earnedBadgeIndex = 0;

        coursesSnap.forEach((courseDoc, index) => {
            const course = courseDoc.data();
            const enroll = myEnrollments[courseDoc.id];
            const officerLvl = rankMapping[currentOfficer.rank] || 0;
            const requiredLevel = Number(course.minRankLevel || 1);
            const isUnlocked = officerLvl >= requiredLevel;
            const isDeptEligible = !course.eligibleDepts?.length || course.eligibleDepts.includes(currentOfficer.department);
            const isStateEligible = !course.eligibleStates?.length || course.eligibleStates.includes(currentOfficer.state);
            const isEligible = isUnlocked && isDeptEligible && isStateEligible;
            const badgeSource = getCourseBadgeSource(course, index);

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

                    const accentClass = earnedBadgeIndex % 2 === 0 ? 'badge-accent-green' : 'badge-accent-red';
                    badgeGallery.innerHTML += `
                        <article class="earned-badge active ${accentClass}">
                            <div class="badge-icon">
                                ${createDashboardImageMarkup(badgeSource, course.title || 'Badge')}
                            </div>
                            <div class="badge-copy">
                                <strong>${course.title || 'Course Badge'}</strong>
                                <span>Completed honor</span>
                            </div>
                        </article>
                    `;
                    earnedBadgeIndex += 1;
                } else {
                    actionBtn = `<button class="course-btn btn-pending" type="button" disabled>Processing</button>`;
                }
            }

            card.innerHTML = `
                <div class="badge-preview">${createDashboardImageMarkup(badgeSource, course.title || 'Course badge')}</div>
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

        wireDashboardImages(grid);
        wireDashboardImages(badgeGallery);
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

function closeSidebar() {
    document.getElementById('sidebar')?.classList.remove('active');
    document.getElementById('dashboardSidebarBackdrop')?.classList.remove('active');
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

        closeSidebar();
    };
}

function setupSidebarToggle() {
    const toggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (!toggle || !sidebar) return;

    let backdrop = document.getElementById('dashboardSidebarBackdrop');
    if (!backdrop) {
        backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.id = 'dashboardSidebarBackdrop';
        backdrop.className = 'sidebar-backdrop';
        backdrop.setAttribute('aria-label', 'Close sidebar');
        document.body.appendChild(backdrop);
    }

    toggle.addEventListener('click', () => {
        const isOpen = sidebar.classList.toggle('active');
        backdrop.classList.toggle('active', isOpen);
    });

    backdrop.addEventListener('click', closeSidebar);
    window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeSidebar();
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
            wireDashboardImages(document.getElementById('sidebarTarget'));
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
