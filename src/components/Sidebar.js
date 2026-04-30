function extractDriveFileId(url) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl || cleanUrl === 'N/A') return '';

    if (cleanUrl.includes('drive.google.com')) {
        const fileId = cleanUrl.match(/[-\w]{25,}/);
        return fileId?.[0] || '';
    }

    return '';
}

function getDashboardImageCandidates(url) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl || cleanUrl === 'N/A') return ['/logo.png'];

    const driveId = extractDriveFileId(cleanUrl);
    if (driveId) {
        return [
            `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
            `https://drive.google.com/uc?export=view&id=${driveId}`,
            `https://lh3.googleusercontent.com/d/${driveId}=w1000`,
            cleanUrl,
            '/logo.png'
        ];
    }

    return [cleanUrl, '/logo.png'];
}

function getOfficerPassportUrl(user = {}) {
    return [
        user.passportUrl,
        user.passportURL,
        user.passport,
        user.photoUrl,
        user.photoURL,
        user.imageUrl,
        user.imageURL,
        user["Passport URL"],
        user["Passport Url"],
        user["PassportURL"],
        user["Passport Photo"],
        user["Photo URL"]
    ].find((value) => String(value || '').trim() && String(value).trim() !== 'N/A') || '';
}

export function setupSidebar(user, activeTab = 'profile') {
    const target = document.getElementById('sidebarTarget');
    const activeProfile = activeTab === 'profile' ? 'active' : '';
    const activeLms = activeTab === 'lms' ? 'active' : '';
    const passportCandidates = getDashboardImageCandidates(getOfficerPassportUrl(user));
    const sidebarHTML = `
    <aside class="sidebar" id="sidebar">
        <div class="sidebar-header"><img src="/logo.png" width="40"><h3>OFFICER PORTAL</h3></div>
        <div class="user-profile-brief">
            <div class="avatar-frame">
                <img
                    class="dashboard-image"
                    src="${passportCandidates[0]}"
                    data-image-candidates='${JSON.stringify(passportCandidates)}'
                    data-image-index="0"
                    alt="Photo"
                    loading="lazy"
                    referrerpolicy="no-referrer"
                >
            </div>
            <h4>${user.surname} ${user.firstName}</h4>
            <small>${user.rank}</small>
        </div>
        <nav class="side-nav">
            <button class="nav-item ${activeProfile}" data-tab-target="profile" onclick="window.switchTab('profile')"><i class="fa-solid fa-id-badge"></i> Personnel Info</button>
            <button class="nav-item ${activeLms}" data-tab-target="lms" onclick="window.switchTab('lms')"><i class="fa-solid fa-graduation-cap"></i> Learning Center</button>
            <a href="${user.pdfUrl || '#'}" target="_blank" class="nav-item ${user.pdfUrl ? '' : 'disabled-link'}"><i class="fa-solid fa-file-pdf"></i> Download ID Form</a>
            <button class="nav-item" type="button" onclick="window.openSecurity()"><i class="fa-solid fa-shield-halved"></i> Security</button>
            <button class="logout-btn" type="button" onclick="window.handleLogout()"><i class="fa-solid fa-power-off"></i> Logout</button>
        </nav>
    </aside>`;
    target.innerHTML = sidebarHTML;
}
