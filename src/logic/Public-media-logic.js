import { db } from '../config.js';
import { collection, getDocs, query, where, orderBy, doc, getDoc, addDoc, serverTimestamp, Timestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function escapeHtml(value = "") {
    return String(value).replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[char]));
}

function formatDate(value) {
    if (!value) return '';
    const date = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });
}

function stripHtml(value = "") {
    const div = document.createElement('div');
    div.innerHTML = String(value);
    return div.textContent || div.innerText || "";
}

function getDate(value) {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeStatus(value = "") {
    return String(value || 'published').toLowerCase().trim();
}

function normalizeCategory(value = "") {
    const category = String(value || '').toLowerCase().trim();
    return category === 'events' ? 'event' : category;
}

function shouldShowPost(post, category, now) {
    const status = normalizeStatus(post.status);
    if (status.includes('draft')) return false;
    if (status.includes('scheduled')) return false;
    if (normalizeCategory(post.category) !== category) return false;

    const publishDate = getDate(post.publishDate);
    if (category === 'event') return true;
    return !publishDate || publishDate <= now;
}

function getExcerpt(content = "", length = 130) {
    const text = stripHtml(content).replace(/\s+/g, ' ').trim();
    if (text.length <= length) return text;
    return `${text.substring(0, length).trim()}...`;
}

function postUrl(id) {
    return `/view.html?id=${encodeURIComponent(id)}`;
}

function renderNewsFeed(grid, posts) {
    if (!posts.length) {
        grid.innerHTML = '<p class="empty-state">No news is live yet.</p>';
        return;
    }

    const [lead, ...rest] = posts;
    const sideStories = rest.slice(0, 2);
    const latest = rest.slice(2);

    grid.innerHTML = `
        <section class="lead-story" onclick="window.location.href='${postUrl(lead.id)}'">
            <img src="${escapeHtml(lead.coverUrl || '/logo.png')}" alt="">
            <div class="lead-copy">
                <span class="media-label">Top Story</span>
                <h2>${escapeHtml(lead.title || 'Untitled')}</h2>
                <p>${escapeHtml(getExcerpt(lead.content, 190))}</p>
                <small>${formatDate(lead.publishDate)} | ${escapeHtml(lead.author || 'National HQ')}</small>
            </div>
        </section>
        <aside class="news-side">
            ${sideStories.map(post => `
                <article class="side-story" onclick="window.location.href='${postUrl(post.id)}'">
                    <img src="${escapeHtml(post.coverUrl || '/logo.png')}" alt="">
                    <div>
                        <span>${formatDate(post.publishDate)}</span>
                        <h3>${escapeHtml(post.title || 'Untitled')}</h3>
                    </div>
                </article>
            `).join('')}
        </aside>
        <section class="latest-strip">
            ${latest.map(post => `
                <article class="news-row" onclick="window.location.href='${postUrl(post.id)}'">
                    <img src="${escapeHtml(post.coverUrl || '/logo.png')}" alt="">
                    <div>
                        <span class="media-label">News</span>
                        <h3>${escapeHtml(post.title || 'Untitled')}</h3>
                        <p>${escapeHtml(getExcerpt(post.content, 120))}</p>
                        <small>${formatDate(post.publishDate)} | ${escapeHtml(post.author || 'National HQ')}</small>
                    </div>
                </article>
            `).join('')}
        </section>
    `;
}

function renderMagazineFeed(grid, posts) {
    if (!posts.length) {
        grid.innerHTML = '<p class="empty-state">No articles are live yet.</p>';
        return;
    }

    const [feature, ...rest] = posts;
    grid.innerHTML = `
        <article class="magazine-feature" onclick="window.location.href='${postUrl(feature.id)}'">
            <img src="${escapeHtml(feature.coverUrl || '/logo.png')}" alt="">
            <div class="feature-copy">
                <span class="media-label">Featured Essay</span>
                <h2>${escapeHtml(feature.title || 'Untitled')}</h2>
                <p>${escapeHtml(getExcerpt(feature.content, 230))}</p>
                <small>By ${escapeHtml(feature.author || 'National HQ')} | ${formatDate(feature.publishDate)}</small>
            </div>
        </article>
        <section class="magazine-grid">
            ${rest.map((post, index) => `
                <article class="magazine-card ${index % 3 === 0 ? 'wide' : ''}" onclick="window.location.href='${postUrl(post.id)}'">
                    <img src="${escapeHtml(post.coverUrl || '/logo.png')}" alt="">
                    <div>
                        <span>${formatDate(post.publishDate)}</span>
                        <h3>${escapeHtml(post.title || 'Untitled')}</h3>
                        <p>${escapeHtml(getExcerpt(post.content, 115))}</p>
                    </div>
                </article>
            `).join('')}
        </section>
    `;
}

function renderEventsFeed(grid, posts) {
    if (!posts.length) {
        grid.innerHTML = '<p class="empty-state">No events are live yet.</p>';
        return;
    }

    grid.innerHTML = posts.map(post => `
        <article class="event-card" onclick="window.location.href='${postUrl(post.id)}'">
            <div class="event-date">
                <span>${formatDate(post.publishDate).split(' ')[0] || 'Event'}</span>
                <strong>${formatDate(post.publishDate).split(' ')[1]?.replace(',', '') || ''}</strong>
            </div>
            <img src="${escapeHtml(post.coverUrl || '/logo.png')}" alt="">
            <div class="event-copy">
                <span class="media-label">Programme</span>
                <h3>${escapeHtml(post.title || 'Untitled')}</h3>
                <p>${escapeHtml(getExcerpt(post.content, 140))}</p>
                <small>${escapeHtml(post.author || 'CADETI')}</small>
            </div>
        </article>
    `).join('');
}

// --- 1. FEED LOADER (News & Articles) ---
export async function loadMediaFeed(category) {
    const gridIds = {
        news: 'newsGrid',
        article: 'articlesGrid',
        event: 'eventsGrid'
    };
    const grid = document.getElementById(gridIds[category] || 'newsGrid');
    if (!grid) return;

    try {
        const now = new Date();
        const snap = await getDocs(collection(db, "publications"));
        const posts = [];

        snap.forEach(d => {
            const post = d.data();
            if (shouldShowPost(post, category, now)) {
                posts.push({ id: d.id, ...post });
            }
        });

        posts.sort((a, b) => {
            const dateA = getDate(a.publishDate)?.getTime() || 0;
            const dateB = getDate(b.publishDate)?.getTime() || 0;
            return category === 'event' ? dateA - dateB : dateB - dateA;
        });

        if (category === 'news') renderNewsFeed(grid, posts);
        if (category === 'article') renderMagazineFeed(grid, posts);
        if (category === 'event') renderEventsFeed(grid, posts);
    } catch (err) {
        console.error(err);
        grid.innerHTML = '<p class="empty-state">Unable to load publications right now.</p>';
    }
}

// --- 2. SINGLE POST READER ---
export async function loadSinglePost() {
    const urlParams = new URLSearchParams(window.location.search);
    const postId = urlParams.get('id');
    if (!postId) return;

    const d = await getDoc(doc(db, "publications", postId));
    if (!d.exists()) {
        document.getElementById('postTitle').innerText = "Publication not found";
        document.getElementById('postContent').innerHTML = '<p>This publication may have been removed.</p>';
        return;
    }
    const post = d.data();

    document.getElementById('postTitle').innerText = post.title;
    document.getElementById('postCategory').innerText = post.category;
    document.getElementById('postAuthor').innerText = post.author || "National HQ";
    document.getElementById('postDate').innerText = formatDate(post.publishDate);
    document.getElementById('postCover').style.backgroundImage = `url(${post.coverUrl || '/logo.png'})`;
    document.getElementById('postContent').innerHTML = post.content || '';

    loadComments(postId);
    setupCommentForm(postId);
}

export async function setupNewsWidget() {
    const existingWidget = document.getElementById('newsWidget');
    if (existingWidget) existingWidget.remove();

    const now = Timestamp.now();
    const q = query(
        collection(db, "publications"),
        where("category", "==", "news"),
        where("isPinned", "==", true),
        where("status", "==", "published"),
        where("publishDate", "<=", now),
        orderBy("publishDate", "desc")
    );

    try {
        const snap = await getDocs(q);
        if (snap.empty) return;

        const item = snap.docs[0];
        const post = item.data();
        document.body.insertAdjacentHTML('beforeend', `
            <aside id="newsWidget" class="news-widget">
                <button class="close-widget" type="button" aria-label="Close news update">&times;</button>
                <small>PINNED NEWS</small>
                <h4>${escapeHtml(post.title)}</h4>
                <a href="/view.html?id=${item.id}">Read update</a>
            </aside>
        `);
        document.querySelector('#newsWidget .close-widget').onclick = () => {
            document.getElementById('newsWidget')?.remove();
        };
    } catch (err) {
        console.error(err);
    }
}

// --- 3. ANONYMOUS COMMENTS ---
async function loadComments(postId) {
    const list = document.getElementById('commentList');
    const q = query(collection(db, "publications", postId, "comments"), where("isApproved", "==", true), orderBy("timestamp", "asc"));
    const snap = await getDocs(q);
    list.innerHTML = snap.empty ? '<p style="color:#aaa">No comments yet. Start the conversation.</p>' : "";
    snap.forEach(d => {
        const c = d.data();
        list.innerHTML += `<div class="comment"><b>${escapeHtml(c.name)}</b><p>${escapeHtml(c.text)}</p></div>`;
    });
}

function setupCommentForm(postId) {
    const form = document.getElementById('commentForm');
    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button');
        btn.disabled = true;
        await addDoc(collection(db, "publications", postId, "comments"), {
            name: document.getElementById('commenterName').value,
            text: document.getElementById('commentText').value,
            isApproved: false, // MODERATION: Requires Admin approval
            timestamp: serverTimestamp()
        });
        alert("Comment submitted for moderation.");
        form.reset();
        btn.disabled = false;
    };
}

// --- 4. SHARING LOGIC ---
window.sharePost = (platform) => {
    const url = window.location.href;
    const title = document.getElementById('postTitle').innerText;
    let shareUrl = "";
    
    if (platform === 'whatsapp') shareUrl = `https://wa.me/?text=${encodeURIComponent(title + " " + url)}`;
    if (platform === 'facebook') shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${url}`;
    if (platform === 'x') shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}`;
    
    window.open(shareUrl, '_blank');
};
