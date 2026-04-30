// src/components/Navbar.js
export function setupNavbar() {
    const link = document.querySelector("link[rel~='icon']") || document.createElement('link');
    link.rel = 'icon';
    link.href = '/logo.png';
    document.getElementsByTagName('head')[0].appendChild(link);

    const navbarHTML = `
      <header class="navbar" id="mainNavbar">
          <a href="/" class="logo-title">
              <img src="/logo.png" alt="CADETI Logo">
              <div class="org-name">
                  <span>COMMUNITY AMBASSADOR</span>
                  <span>FOR DEVELOPMENTAL AND ENGAGEMENT</span>
                  <span>TECHNIQUES INITIATIVE</span> 
                  <span class="Last_Child">(C.A.D.E.T.I.)</span>
              </div>
          </a>
  
          <button class="menu-btn" id="menuBtn">
              <i class="fa-solid fa-bars"></i>
          </button>
  
          <nav class="icon-nav" id="navLinks">
              <a href="/index.html" class="nav-link"><i class="fa-solid fa-house"></i> <span>Home</span></a>
              <a href="/about.html" class="nav-link"><i class="fa-solid fa-circle-info"></i> <span>About</span></a>
              
              <!-- RECRUITMENT CTA -->
              <a href="/recruit-reg.html" class="nav-link cta-link">
                <i class="fa-solid fa-user-plus"></i> <span>Join Cadet</span>
              </a>

              <!-- PORTAL BUCKET -->
              <div class="nav-dropdown">
                  <a href="#" class="nav-link drop-trigger"><i class="fa-solid fa-shield-halved"></i> <span>Portal</span> <i class="fa-solid fa-chevron-down chevron"></i></a>
                  <div class="dropdown-content">
                      <a href="/member-validation.html"><i class="fa-solid fa-check-double"></i> Member Validation</a>
                      <a href="/old-member.html"><i class="fa-solid fa-user-clock"></i> Member Revalidation</a>
                      <a href="/login.html"><i class="fa-solid fa-right-to-bracket"></i> Officer Login</a>
                  </div>
              </div>
  
              <!-- MEDIA BUCKET -->
              <div class="nav-dropdown">
                  <a href="#" class="nav-link drop-trigger"><i class="fa-solid fa-newspaper"></i> <span>Media & Pubs</span> <i class="fa-solid fa-chevron-down chevron"></i></a>
                  <div class="dropdown-content">
                      <a href="/news.html"><i class="fa-solid fa-bullhorn"></i> News</a>
                      <a href="/events.html"><i class="fa-solid fa-calendar-days"></i> Events</a>
                      <a href="/gallery.html"><i class="fa-solid fa-images"></i> Photo Gallery</a>
                      <a href="/publications.html"><i class="fa-solid fa-book-open"></i> Articles & Columns</a>
                  </div>
              </div>

              <a href="/contact.html" class="nav-link"><i class="fa-solid fa-envelope"></i> <span>Contact</span></a>
          </nav>
      </header>
    `;
  
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
  
    // --- Logic for Scroll Effect ---
    const navbar = document.getElementById('mainNavbar');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  
    // --- Logic for Mobile Menu Toggle ---
    const menuBtn = document.getElementById('menuBtn');
    const navLinks = document.getElementById('navLinks');
    
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            menuBtn.classList.toggle('active');
            const icon = menuBtn.querySelector('i');
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-xmark');
        });
    }

    // --- NEW: Improved Mobile Dropdown Logic (Handles Multiple) ---
    const dropdowns = document.querySelectorAll('.nav-dropdown');
    
    dropdowns.forEach(dropdown => {
        const trigger = dropdown.querySelector('.drop-trigger');
        if (trigger) {
            trigger.addEventListener('click', (event) => {
                if (window.innerWidth <= 1024) {
                    event.preventDefault();
                    // Close other dropdowns
                    dropdowns.forEach(other => {
                        if(other !== dropdown) other.classList.remove('active');
                    });
                    // Toggle current
                    dropdown.classList.toggle('active');
                }
            });
        }
    });
}