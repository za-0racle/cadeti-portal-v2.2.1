// src/components/MediaSidebar.js
import { getAdminAssignedState, getAdminDisplayName, getAdminRole } from '../utils/adminProfile.js';

export function setupMediaSidebar(admin, activeTab = 'content-list') {
    const target = document.getElementById('mediaSidebarTarget');
    if (!target) return;

    const displayName = getAdminDisplayName(admin);
    const role = getAdminRole(admin);
    const scope = role === 'state'
        ? `${getAdminAssignedState(admin) || 'State'} Command`
        : role.includes('media')
            ? 'Press Center HQ'
            : 'National HQ';

    target.innerHTML = `
    <aside class="cmd-sidebar">
      <div class="sidebar-top">
        <img src="/logo.png" class="sidebar-logo">
        <div class="admin-identity">
            <h3>${displayName}</h3>
            <span>${scope}</span>
        </div>
      </div>
      
      <nav class="cmd-nav">
        <button onclick="window.switchMediaTab('content-list')" class="nav-btn ${activeTab === 'content-list' ? 'active' : ''}">
            <i class="fa-solid fa-file-lines"></i> <span>Manage Posts</span>
        </button>
        <button onclick="window.switchMediaTab('moderation')" class="nav-btn ${activeTab === 'moderation' ? 'active' : ''}">
            <i class="fa-solid fa-comments"></i> <span>Moderation</span>
        </button>
        <hr style="opacity: 0.1; margin: 15px 0;">
        <button onclick="window.openAdminSecurity()" class="action-btn-outline" type="button">
            <i class="fa-solid fa-lock"></i> <span>Password</span>
        </button>
        <button onclick="window.handleLogout()" class="exit-btn">Exit System</button>
      </nav>

      <div class="sidebar-footer">
        <p>&copy; 2026 CADETI Press</p>
      </div>
    </aside>
    `;
}
