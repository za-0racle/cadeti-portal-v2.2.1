// src/main.js
import './styles/global.css';
import './styles/dashboard.css';
import { setupNavbar } from './components/Navbar.js';
import { setupFooter } from './components/Footer.js';
import { startAuthObserver, initAuth, initSignup } from './logic/Auth-logic.js';

// 1. Start the Gatekeeper immediately
startAuthObserver();

// 2. ONLY setup Website UI if NOT on a Dashboard/Admin page
const path = window.location.pathname.toLowerCase();
const isDashboard = path.includes('admin') || path.includes('dashboard');

if (!isDashboard) {
    setupNavbar();
    setupFooter();
}

// Slideshow Engine
function initSlideshow() {
    const slides = document.querySelectorAll('.slide');
    if (slides.length > 0) {
        let currentSlide = 0;
        setInterval(() => {
            slides[currentSlide].classList.remove('active');
            currentSlide = (currentSlide + 1) % slides.length;
            slides[currentSlide].classList.add('active');
        }, 6000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initSlideshow();
    
    // --- HOME PAGE (News Widget) ---
    if (path === '/' || path.includes('index.html')) {
        import('./logic/Public-media-logic.js').then(m => {
            // Check for pinned news to show the widget
            m.setupNewsWidget();
        });
    }

    // --- NEWS FEED ---
    if (path.includes('news.html')) {
        import('./logic/Public-media-logic.js').then(m => m.loadMediaFeed('news'));
    }

    // --- ARTICLES & PUBLICATIONS FEED ---
    if (path.includes('publications.html')) {
        import('./logic/Public-media-logic.js').then(m => m.loadMediaFeed('article'));
    }

    // --- EVENTS FEED ---
    if (path.includes('events.html')) {
        import('./logic/Public-media-logic.js').then(m => m.loadMediaFeed('event'));
    }

    // --- DYNAMIC READER (Single Post View) ---
    if (path.includes('view.html')) {
        import('./logic/Public-media-logic.js').then(m => m.loadSinglePost());
    }
    // 3. PAGE SPECIFIC LOGIC
    if (path.includes('login')) {
        initAuth();
    }

    if (path.includes('signup')) {
        initSignup();
    }

    if (path.includes('admin.html')) {
        import('./logic/Admin-logic.js').then(m => m.initAdminDashboard());
    }

    if (path.includes('dashboard')) {
        import('./logic/Dashboard-logic.js').then(m => m.initDashboard());
    }

    if (path.includes('about')) {
        import('./logic/About-logic.js').then(m => m.initAboutPage());
    }

    if (path.includes('gallery')) {
        import('./logic/gallery-logic.js').then(m => m.initGallery());
    }

    if (path.includes('contact')) {
        import('./logic/Contact-logic.js').then(m => m.initContactPage());
    }

    if (path.includes('admin-media')) {
        import('./logic/Media-logic.js').then(m => m.initMediaDashboard());
    }

    // REGISTRATION ENGINE
    import('./logic/Registration-logic.js').then(m => {
        if (document.getElementById('recruitForm')) m.initRecruit();
        if (document.getElementById('validationForm')) m.initValidation();
        if (document.getElementById('cadetiForm')) m.initRevalidation();
    });
});
