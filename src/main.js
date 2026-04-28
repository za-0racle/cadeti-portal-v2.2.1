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

    // 3. PAGE SPECIFIC LOGIC
    if (path.includes('login')) {
        initAuth();
    }

    if (path.includes('signup')) {
        initSignup();
    }

    if (path.includes('admin')) {
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

    // REGISTRATION ENGINE
    import('./logic/Registration-logic.js').then(m => {
        if (document.getElementById('recruitForm')) m.initRecruit();
        if (document.getElementById('validationForm')) m.initValidation();
        if (document.getElementById('cadetiForm')) m.initRevalidation();
    });
});
