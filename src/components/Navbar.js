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
              
              <div class="nav-dropdown">
                  <a href="#" class="nav-link"><i class="fa-solid fa-user-plus"></i> <span>Registration</span></a>
                  <div class="dropdown-content">
                      <a href="/recruit-reg.html">Recruit Registration</a>
                      <a href="/member-validation.html">Member Validation</a>
                      <a href="/old-member.html">Member Revalidation</a>
                  </div>
              </div>
  
              <a href="gallery.html" class="nav-link"><i class="fa-solid fa-images"></i> <span>Gallery</span></a>
              <a href="/login.html" class="nav-link"><i class="fa-solid fa-right-to-bracket"></i> <span>Login</span></a>
          </nav>
      </header>
    `;
  
    document.body.insertAdjacentHTML('afterbegin', navbarHTML);
  
    // Logic for Scroll Effect
    const navbar = document.getElementById('mainNavbar');
    window.addEventListener('scroll', () => {
      if (window.scrollY > 50) {
        navbar.classList.add('scrolled');
      } else {
        navbar.classList.remove('scrolled');
      }
    });
  
    // Logic for Mobile Menu
    const menuBtn = document.getElementById('menuBtn');
    const navLinks = document.getElementById('navLinks');
    const navDropdown = document.querySelector('.nav-dropdown');
    const navDropdownTrigger = navDropdown?.querySelector('.nav-link');
    
    if (menuBtn) {
        menuBtn.addEventListener('click', () => {
            navLinks.classList.toggle('active');
            menuBtn.classList.toggle('active');
            const icon = menuBtn.querySelector('i');
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-xmark');
        });
    }

    if (navDropdown && navDropdownTrigger) {
        navDropdownTrigger.addEventListener('click', (event) => {
            if (window.innerWidth <= 1024) {
                event.preventDefault();
                navDropdown.classList.toggle('active');
            }
        });
    }
}
