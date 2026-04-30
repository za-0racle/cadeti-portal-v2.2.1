import { auth } from '../config.js';
import {
    EmailAuthProvider,
    reauthenticateWithCredential,
    updatePassword
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

const MODAL_ID = 'adminSecurityModal';

function setMessage(text, tone = '') {
    const msg = document.getElementById('adminSecurityMsg');
    if (!msg) return;

    msg.style.display = 'block';
    msg.textContent = text;
    msg.style.color = tone === 'success' ? '#1b7f3a' : '#b42318';
}

function resetMessage() {
    const msg = document.getElementById('adminSecurityMsg');
    if (!msg) return;

    msg.style.display = 'none';
    msg.textContent = '';
    msg.style.color = '';
}

function closeAdminSecurity() {
    const modal = document.getElementById(MODAL_ID);
    if (modal) modal.style.display = 'none';
}

function ensureAdminSecurityModal() {
    if (document.getElementById(MODAL_ID)) return;

    const modal = document.createElement('div');
    modal.id = MODAL_ID;
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-card animate-up">
            <div class="modal-header">
                <h3>Change Password</h3>
                <button type="button" id="closeAdminSecurityBtn">&times;</button>
            </div>
            <form id="adminSecurityForm" class="modal-form">
                <p class="subtitle">Enter your current password, then create a new one.</p>
                <div class="input-group-modal">
                    <label for="adminCurrentPassword">Current Password</label>
                    <input type="password" id="adminCurrentPassword" autocomplete="current-password" required>
                </div>
                <div class="input-group-modal">
                    <label for="adminNewPassword">New Password</label>
                    <input type="password" id="adminNewPassword" autocomplete="new-password" minlength="6" required>
                </div>
                <button type="submit" class="cmd-btn" id="adminUpdatePasswordBtn">Update Password</button>
                <div id="adminSecurityMsg" class="status-box" style="display: none;"></div>
            </form>
        </div>
    `;

    document.body.appendChild(modal);
}

export function setupAdminPasswordModal() {
    ensureAdminSecurityModal();

    const modal = document.getElementById(MODAL_ID);
    const closeBtn = document.getElementById('closeAdminSecurityBtn');
    const form = document.getElementById('adminSecurityForm');

    window.openAdminSecurity = () => {
        resetMessage();
        const currentPassword = document.getElementById('adminCurrentPassword');
        const newPassword = document.getElementById('adminNewPassword');
        if (currentPassword) currentPassword.value = '';
        if (newPassword) newPassword.value = '';
        if (modal) modal.style.display = 'flex';
        currentPassword?.focus();
    };

    if (closeBtn?.dataset.bound !== 'true') {
        closeBtn.dataset.bound = 'true';
        closeBtn.addEventListener('click', closeAdminSecurity);
    }

    if (modal?.dataset.bound !== 'true') {
        modal.dataset.bound = 'true';
        modal.addEventListener('click', (event) => {
            if (event.target === modal) closeAdminSecurity();
        });
    }

    if (form?.dataset.bound === 'true') return;
    if (form) {
        form.dataset.bound = 'true';
        form.addEventListener('submit', async (event) => {
            event.preventDefault();

            const currentPassword = document.getElementById('adminCurrentPassword')?.value || '';
            const newPassword = document.getElementById('adminNewPassword')?.value || '';
            const btn = document.getElementById('adminUpdatePasswordBtn');
            const user = auth.currentUser;

            if (!user?.email) {
                setMessage('No active admin session found. Please log in again.');
                return;
            }

            if (!currentPassword || !newPassword) {
                setMessage('Enter both your current and new password.');
                return;
            }

            if (newPassword.length < 6) {
                setMessage('New password must be at least 6 characters.');
                return;
            }

            if (btn) {
                btn.disabled = true;
                btn.textContent = 'Updating...';
            }

            try {
                const credential = EmailAuthProvider.credential(user.email, currentPassword);
                await reauthenticateWithCredential(user, credential);
                await updatePassword(user, newPassword);

                setMessage('Password updated successfully.', 'success');
                document.getElementById('adminCurrentPassword').value = '';
                document.getElementById('adminNewPassword').value = '';
            } catch (error) {
                console.error('Admin password update failed:', error);
                setMessage('Unable to update password. Confirm your current password and try again.');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.textContent = 'Update Password';
                }
            }
        });
    }
}
