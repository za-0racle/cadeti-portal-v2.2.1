import { db, SCRIPT_URL } from '../config.js';
import { collection, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function value(record = {}, ...keys) {
    for (const key of keys) {
        const next = record[key];
        if (next !== undefined && next !== null && String(next).trim() && String(next).trim() !== 'N/A') {
            return String(next).trim();
        }
    }
    return '';
}

function extractDriveFileId(url) {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl.includes('drive.google.com')) return '';
    return cleanUrl.match(/[-\w]{25,}/)?.[0] || '';
}

function imageCandidates(url, fallback = '/logo.png') {
    const cleanUrl = String(url || '').trim();
    if (!cleanUrl || cleanUrl === 'N/A') return [fallback];

    const driveId = extractDriveFileId(cleanUrl);
    if (!driveId) return [cleanUrl, fallback];

    return [
        `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
        `https://drive.google.com/uc?export=view&id=${driveId}`,
        `https://lh3.googleusercontent.com/d/${driveId}=w1000`,
        cleanUrl,
        fallback
    ];
}

function imageMarkup(url, className, alt, fallback = '/logo.png') {
    const candidates = imageCandidates(url, fallback);
    return `<img
        class="${escapeHtml(className)}"
        src="${escapeHtml(candidates[0])}"
        data-image-candidates='${escapeHtml(JSON.stringify(candidates))}'
        data-image-index="0"
        alt="${escapeHtml(alt)}"
        referrerpolicy="no-referrer"
    >`;
}

function wireImages(root = document) {
    root.querySelectorAll('img[data-image-candidates]').forEach((image) => {
        image.addEventListener('error', () => {
            const candidates = JSON.parse(image.dataset.imageCandidates || '[]');
            const nextIndex = Number(image.dataset.imageIndex || 0) + 1;
            if (!candidates[nextIndex]) return;
            image.dataset.imageIndex = String(nextIndex);
            image.src = candidates[nextIndex];
        });
    });
}

async function fetchOfficer(serviceNumber) {
    const response = await fetch(`${SCRIPT_URL}?action=searchByServiceNumber&serviceNumber=${encodeURIComponent(serviceNumber)}`);
    const result = await response.json();
    if (result.status !== 'success' || !result.data) throw new Error('Officer record not found.');
    return result.data;
}

async function fetchCompletedCourses(officer) {
    try {
        const serviceNumber = value(officer, 'Service Number', 'serviceNumber');
        const uniqueID = value(officer, 'Unique ID', 'uniqueID');
        const filters = [];
        if (serviceNumber) filters.push(query(collection(db, 'enrollments'), where('serviceNumber', '==', serviceNumber), where('status', '==', 'completed')));
        if (uniqueID) filters.push(query(collection(db, 'enrollments'), where('uniqueID', '==', uniqueID), where('status', '==', 'completed')));

        const enrollments = new Map();
        const snapshots = await Promise.all(filters.map((nextQuery) => getDocs(nextQuery)));
        snapshots.forEach((snap) => {
            snap.forEach((docSnap) => {
                const data = docSnap.data();
                enrollments.set(data.courseID || docSnap.id, { id: docSnap.id, ...data });
            });
        });

        const completed = [...enrollments.values()];
        if (!completed.length) return [];

        const coursesSnap = await getDocs(collection(db, 'courses'));
        const courses = new Map();
        coursesSnap.forEach((docSnap) => courses.set(docSnap.id, { id: docSnap.id, ...docSnap.data() }));

        return completed.map((enroll) => {
            const course = courses.get(enroll.courseID) || {};
            return {
                title: enroll.courseTitle || course.title || 'Approved Course',
                badgeUrl: course.badgeUrl || enroll.badgeUrl || ''
            };
        });
    } catch (error) {
        console.warn('Approved course lookup failed:', error);
        return [];
    }
}

function renderVerification(officer, courses) {
    const root = document.getElementById('verifyIdApp');
    const passportUrl = value(officer, 'Passport URL', 'Passport Url', 'passportUrl', 'photoUrl', 'photo', 'passport');
    const serviceNumber = value(officer, 'Service Number', 'serviceNumber');
    const rank = value(officer, 'Rank', 'rank');

    root.innerHTML = `
        <section class="verify-card">
            <div class="verify-inner">
                <header class="verify-header">
                    <img src="/logo.png" alt="CADETI logo">
                    <h1>COMMUNITY AMBASSADOR FOR DEVELOPMENTAL AND ENGAGEMENT TECHNIQUES INITIATIVE</h1>
                </header>
                <div class="verify-banner">ID VERIFIED</div>
                <div class="verify-passport">
                    ${passportUrl ? imageMarkup(passportUrl, 'verify-passport-img', 'Officer passport') : '<span>NO PHOTO</span>'}
                </div>
                <div class="verify-details">
                    <div class="verify-row"><strong>SERVICE NO:</strong><span>${escapeHtml(serviceNumber || 'N/A')}</span></div>
                    <div class="verify-row"><strong>RANK:</strong><span>${escapeHtml(rank || 'N/A')}</span></div>
                </div>
                <section class="course-strip">
                    <h2>APPROVED COURSES</h2>
                    <div class="course-badges">
                        ${courses.length ? courses.map((course) => `
                            <article class="course-badge">
                                ${imageMarkup(course.badgeUrl, 'course-badge-img', course.title)}
                                <span>${escapeHtml(course.title)}</span>
                            </article>
                        `).join('') : '<div class="verify-state">No approved courses yet.</div>'}
                    </div>
                </section>
            </div>
        </section>
    `;
    wireImages(root);
}

function renderError(message) {
    document.getElementById('verifyIdApp').innerHTML = `
        <section class="verify-card">
            <div class="verify-state">${escapeHtml(message)}</div>
        </section>
    `;
}

export async function initIdVerification() {
    const params = new URLSearchParams(window.location.search);
    const serviceNumber = params.get('sn') || params.get('serviceNumber');
    if (!serviceNumber) {
        renderError('Missing service number.');
        return;
    }

    try {
        const officer = await fetchOfficer(serviceNumber);
        const courses = await fetchCompletedCourses(officer);
        renderVerification(officer, courses);
    } catch (error) {
        console.error('ID verification failed:', error);
        renderError(error.message || 'Unable to verify this ID card.');
    }
}
