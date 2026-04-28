import { SCRIPT_URL } from '../config.js';

function extractDriveFileId(url = "") {
    const cleanUrl = String(url).trim();
    if (!cleanUrl) return "";

    const patterns = [
        /\/file\/d\/([^/]+)/i,
        /[?&]id=([^&]+)/i,
        /\/d\/([^/]+)/i
    ];

    for (const pattern of patterns) {
        const match = cleanUrl.match(pattern);
        if (match?.[1]) return match[1];
    }

    return "";
}

function normalizeImageUrl(url = "") {
    const cleanUrl = String(url).trim();
    if (!cleanUrl) return "";

    if (cleanUrl.includes('drive.google.com')) {
        const fileId = extractDriveFileId(cleanUrl);
        if (fileId) {
            return `https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`;
        }
    }

    return cleanUrl;
}

function normalizeGalleryItem(item = {}) {
    const category = String(
        item.category ??
        item.Category ??
        item.displayCategory ??
        item.DisplayCategory ??
        'archive'
    ).trim().toLowerCase().replace(/\s+/g, '-');

    const displayCategory = String(
        item.displayCategory ??
        item.DisplayCategory ??
        item.category ??
        item.Category ??
        'Archive'
    ).trim();

    const rawUrl = item.url ?? item.URL ?? item.imageUrl ?? item.ImageURL ?? item.link ?? item.Link ?? "";
    const url = normalizeImageUrl(rawUrl);

    return {
        category,
        displayCategory: displayCategory || 'Archive',
        url
    };
}

function setupLightbox() {
    const lightbox = document.getElementById('lightbox');
    const lbImg = document.getElementById('lightbox-img');
    if (!lightbox || !lbImg) return;

    document.querySelectorAll('.gallery-card').forEach((item) => {
        item.onclick = () => {
            const image = item.querySelector('img');
            if (!image?.src) return;
            lbImg.src = image.src;
            lightbox.classList.add('active');
        };
    });

    lightbox.onclick = () => lightbox.classList.remove('active');
}

export async function initGallery() {
    const grid = document.getElementById('galleryGrid');
    const filterBar = document.getElementById('filterBar');
    if (!grid || !filterBar) return;

    grid.innerHTML = `<div class="loader-container"><div class="loader"></div><p>Syncing Archives...</p></div>`;

    try {
        const response = await fetch(`${SCRIPT_URL}?action=getGallery`);
        const payload = await response.json();
        const allImages = (Array.isArray(payload) ? payload : payload?.data || [])
            .map(normalizeGalleryItem)
            .filter((img) => img.url);

        if (!allImages.length) {
            grid.innerHTML = `<p class="error-msg">No gallery images are available right now.</p>`;
            filterBar.innerHTML = '';
            return;
        }

        const categories = ['all', ...new Set(allImages.map((img) => img.category).filter(Boolean))];
        filterBar.innerHTML = categories.map((cat) => `
            <button class="filter-btn ${cat === 'all' ? 'active' : ''}" data-filter="${cat}">
                ${cat.replace(/-/g, ' ')}
            </button>
        `).join('');

        function renderImages(filter) {
            const filtered = filter === 'all'
                ? allImages
                : allImages.filter((img) => img.category === filter);

            if (!filtered.length) {
                grid.innerHTML = `<p class="error-msg">No images found for this category.</p>`;
                return;
            }

            grid.innerHTML = filtered.map((img) => `
                <div class="gallery-item" data-category="${img.category}">
                    <div class="gallery-card">
                        <img
                            src="${img.url}"
                            alt="${img.displayCategory}"
                            loading="lazy"
                            referrerpolicy="no-referrer"
                            onload="this.closest('.gallery-item')?.classList.add('loaded')"
                            onerror="this.closest('.gallery-item')?.classList.add('loaded'); this.closest('.gallery-card')?.classList.add('image-failed');"
                        >
                        <div class="gallery-overlay">
                            <i class="fa-solid fa-maximize"></i>
                            <span>${img.displayCategory}</span>
                        </div>
                    </div>
                </div>
            `).join('');

            setupLightbox();
        }

        filterBar.querySelectorAll('.filter-btn').forEach((btn) => {
            btn.onclick = () => {
                filterBar.querySelector('.active')?.classList.remove('active');
                btn.classList.add('active');
                renderImages(btn.dataset.filter);
            };
        });

        renderImages('all');
    } catch (err) {
        console.error('Gallery load failed:', err);
        grid.innerHTML = `<p class="error-msg">Offline: Unable to reach Google Drive Archives.</p>`;
        filterBar.innerHTML = '';
    }
}
