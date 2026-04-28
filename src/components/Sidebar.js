export function setupSidebar(user, activeTab = 'profile') {
    const target = document.getElementById('sidebarTarget');
    const activeProfile = activeTab === 'profile' ? 'active' : '';
    const activeLms = activeTab === 'lms' ? 'active' : '';
    const sidebarHTML = `
    <aside class="sidebar" id="sidebar">
        <div class="sidebar-header"><img src="/logo.png" width="40"><h3>OFFICER PORTAL</h3></div>
        <div class="user-profile-brief">
            <div class="avatar-frame"><img src="${user.passportUrl ? user.passportUrl : '/logo.png'}" alt="Photo"></div>
            <h4>${user.surname} ${user.firstName}</h4>
            <small>${user.rank}</small>
        </div>
        <nav class="side-nav">
            <button class="nav-item ${activeProfile}" data-tab-target="profile" onclick="window.switchTab('profile')"><i class="fa-solid fa-id-badge"></i> Personnel Info</button>
            <button class="nav-item ${activeLms}" data-tab-target="lms" onclick="window.switchTab('lms')"><i class="fa-solid fa-graduation-cap"></i> Learning Center</button>
            <a href="${user.pdfUrl || '#'}" target="_blank" class="nav-item ${user.pdfUrl ? '' : 'disabled-link'}"><i class="fa-solid fa-file-pdf"></i> Download ID Form</a>
            <button class="nav-item" type="button" onclick="window.openSecurity()"><i class="fa-solid fa-shield-halved"></i> Security</button>
            <button class="logout-btn" onclick="window.handleLogout()"><i class="fa-solid fa-power-off"></i> Logout</button>
        </nav>
    </aside>`;
    target.innerHTML = sidebarHTML;
}
