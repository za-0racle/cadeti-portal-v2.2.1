import { db, auth, SCRIPT_URL } from '../config.js';
import {
    collection, addDoc, getDocs, doc, getDoc, updateDoc, deleteDoc,
    query, where, orderBy, serverTimestamp, Timestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { setupMediaSidebar } from '../components/MediaSidebar.js';
import { setupAdminPasswordModal } from './AdminPassword.js';
import { getAdminDisplayName, getAdminRole } from '../utils/adminProfile.js';

let allPosts = [];
let currentAdmin = null;

function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'flex';
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.style.display = 'none';
}

window.openModal = window.openModal || openModal;
window.closeModal = window.closeModal || closeModal;

function getScheduledDate() {
    const value = document.getElementById('postSchedule')?.value;
    const date = value ? new Date(value) : new Date();
    return Number.isNaN(date.getTime()) ? new Date() : date;
}

function getPostStatus(scheduledDate) {
    const explicitStatus = document.getElementById('postStatus')?.value;
    if (explicitStatus) return explicitStatus;
    return scheduledDate > new Date() ? 'scheduled' : 'published';
}

function toDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function toDatetimeLocal(value) {
    const date = toDate(value);
    if (!date) return "";
    const offsetMs = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function formatDate(value) {
    return toDate(value)?.toLocaleDateString() || 'N/A';
}

function setUploadMode(mode) {
    const btnLink = document.getElementById('btn-use-link');
    const btnUpload = document.getElementById('btn-use-upload');
    const linkArea = document.getElementById('input-link-area');
    const uploadArea = document.getElementById('input-upload-area');
    const useUpload = mode === 'upload';

    btnLink?.classList.toggle('active', !useUpload);
    btnUpload?.classList.toggle('active', useUpload);
    if (linkArea) linkArea.style.display = useUpload ? 'none' : 'block';
    if (uploadArea) uploadArea.style.display = useUpload ? 'block' : 'none';
}

function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error("Unable to read image file."));
        reader.readAsDataURL(file);
    });
}

async function uploadCoverToDrive(file) {
    const dataUrl = await fileToBase64(file);
    const [, base64 = ""] = dataUrl.split(',');

    const response = await fetch(SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "uploadMedia",
            base64,
            mimeType: file.type,
            fileName: file.name
        })
    });

    const result = await response.json();
    if (result.status !== "success" || !result.url) {
        throw new Error(result.message || "Image upload failed.");
    }

    return result.url;
}

export async function initMediaDashboard() {
    setupAdminPasswordModal();

    onAuthStateChanged(auth, async (user) => {
        if (!user) {
            window.location.href = '/login.html';
            return;
        }

        const loader = document.getElementById('authGuardLoader');
        const wrapper = document.getElementById('mediaWrapper');

        try {
            const adminSnap = await getDoc(doc(db, "admins", user.uid));
            const role = getAdminRole(adminSnap.data() || {});

            if (!adminSnap.exists() || (!role.includes('media') && role !== 'super' && role !== 'national')) {
                window.location.href = '/admin.html';
                return;
            }

            currentAdmin = adminSnap.data();
            setupMediaSidebar(currentAdmin);
            setupComposerListeners();
            await fetchPressArchive();

            if (loader) loader.style.display = 'none';
            if (wrapper) wrapper.style.display = 'flex';
        } catch (error) {
            console.error('Media dashboard init failed:', error);
            if (loader) loader.style.display = 'none';
            alert("Unable to load media dashboard.");
        }
    });
}

function setupComposerListeners() {
    const form = document.getElementById('publicationForm');

    document.getElementById('btn-use-link')?.addEventListener('click', () => setUploadMode('link'));
    document.getElementById('btn-use-upload')?.addEventListener('click', () => setUploadMode('upload'));
    document.getElementById('composerModal')?.addEventListener('click', (event) => {
        if (event.target.id === 'composerModal') closeModal('composerModal');
    });

    if (form && form.dataset.bound !== 'true') {
        form.dataset.bound = 'true';
        form.addEventListener('submit', handlePublication);
    }
}

async function handlePublication(e) {
    e.preventDefault();

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const postId = document.getElementById('editPostId')?.value || "";
    const file = document.getElementById('postImageFile')?.files?.[0];
    let finalImageUrl = document.getElementById('postImageUrl')?.value.trim() || "";

    submitBtn.disabled = true;
    submitBtn.innerText = "PROCESSING...";

        try {
        if (file) {
            submitBtn.innerText = "UPLOADING COVER...";
            finalImageUrl = await uploadCoverToDrive(file);
        }

        const scheduledDate = getScheduledDate();
        const postData = {
            title: document.getElementById('postTitle')?.value.trim() || '',
            content: document.getElementById('postBody')?.value || '',
            category: document.getElementById('postCategory')?.value || 'news',
            coverUrl: finalImageUrl,
            isPinned: Boolean(document.getElementById('isPinned')?.checked),
            publishDate: Timestamp.fromDate(scheduledDate),
            status: getPostStatus(scheduledDate),
            author: document.getElementById('postAuthor')?.value.trim() || getAdminDisplayName(currentAdmin) || "National HQ",
            updatedAt: serverTimestamp()
        };

        if (postData.isPinned) {
            await handleGlobalUnpin();
        }

        if (postId) {
            await updateDoc(doc(db, "publications", postId), postData);
            alert("Update successful.");
        } else {
            await addDoc(collection(db, "publications"), {
                ...postData,
                createdAt: serverTimestamp()
            });
            alert("Publication saved successfully.");
        }

        closeModal('composerModal');
        await fetchPressArchive();
    } catch (err) {
        console.error(err);
        alert(`Publication failed: ${err.message || 'Please check permissions and try again.'}`);
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "EXECUTE PUBLICATION";
    }
}

async function handleGlobalUnpin() {
    const q = query(collection(db, "publications"), where("isPinned", "==", true));
    const snap = await getDocs(q);
    const updates = [];
    snap.forEach((item) => {
        updates.push(updateDoc(doc(db, "publications", item.id), { isPinned: false }));
    });
    await Promise.all(updates);
}

async function fetchPressArchive() {
    const tbody = document.getElementById('contentTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="5">Syncing Archive...</td></tr>';

    try {
        const q = query(collection(db, "publications"), orderBy("publishDate", "desc"));
        const snap = await getDocs(q);

        allPosts = [];
        tbody.innerHTML = snap.empty ? '<tr><td colspan="5">No publications yet.</td></tr>' : "";

        snap.forEach((item) => {
            const post = item.data();
            allPosts.push({ id: item.id, ...post });
            const category = post.category || 'news';
            const status = post.status || 'published';
            const pinnedIcon = post.isPinned ? '<i class="fa-solid fa-thumbtack"></i>' : '';

            tbody.innerHTML += `
                <tr>
                    <td><small>${formatDate(post.publishDate)}</small></td>
                    <td><b>${post.title || 'Untitled'}</b> ${pinnedIcon}</td>
                    <td><span class="rank-badge badge-green">${category.toUpperCase()}</span></td>
                    <td><span class="status-indicator">${status}</span></td>
                    <td>
                        <button class="action-icon" type="button" onclick="window.editPost('${item.id}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-icon" type="button" style="color:red" onclick="window.deletePost('${item.id}')"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });
    } catch (error) {
        console.error('Archive load failed:', error);
        tbody.innerHTML = '<tr><td colspan="5">Unable to load archive.</td></tr>';
    }
}

window.switchMediaTab = (tabId) => {
    document.querySelectorAll('.tab-content').forEach(t => t.style.display = 'none');
    const target = document.getElementById(`section-${tabId}`);
    if (target) target.style.display = 'block';
    setupMediaSidebar(currentAdmin, tabId);
};

window.openComposer = () => {
    document.getElementById('publicationForm')?.reset();
    document.getElementById('editPostId').value = "";
    document.getElementById('postCategory').value = "news";
    document.getElementById('postStatus').value = "published";
    document.getElementById('postAuthor').value = getAdminDisplayName(currentAdmin) || "National HQ";
    document.getElementById('composerTitle').innerText = "New Publication";
    setUploadMode('link');
    openModal('composerModal');
};

window.editPost = async (id) => {
    const d = await getDoc(doc(db, "publications", id));
    if (!d.exists()) return alert("Publication not found.");

    const post = d.data();
    document.getElementById('editPostId').value = id;
    document.getElementById('postCategory').value = post.category || 'news';
    document.getElementById('postStatus').value = post.status || 'published';
    document.getElementById('postAuthor').value = post.author || getAdminDisplayName(currentAdmin) || "National HQ";
    document.getElementById('postTitle').value = post.title || '';
    document.getElementById('postBody').value = post.content || '';
    document.getElementById('postImageUrl').value = post.coverUrl || '';
    document.getElementById('isPinned').checked = Boolean(post.isPinned);
    document.getElementById('postSchedule').value = toDatetimeLocal(post.publishDate);

    document.getElementById('composerTitle').innerText = "Edit Publication";
    setUploadMode('link');
    openModal('composerModal');
};

window.deletePost = async (id) => {
    if (confirm("Permanently remove this publication from the archive?")) {
        await deleteDoc(doc(db, "publications", id));
        await fetchPressArchive();
    }
};
