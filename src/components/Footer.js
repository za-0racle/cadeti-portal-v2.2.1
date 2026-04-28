// src/components/Footer.js
export function setupFooter() {
    const footerHTML = `
    <footer class="footer">
        <div class="footer-container">
            <div class="footer-grid">
                
                <!-- Column 1: Brand & Identity -->
                <div class="footer-brand">
                    <div class="footer-logo-name">
                        <span>COMMUNITY AMBASSADOR</span>
                        <span>FOR DEVELOPMENTAL AND ENGAGEMENT</span>
                        <span>TECHNIQUES INITIATIVE</span> 
                        <span class="Last_Child">(C.A.D.E.T.I.)</span>
                    </div>
                    <p class="footer-motto">"To build and secure the hope of youths in the society."</p>
                    <div class="contact-details">
                        <p><i class="fas fa-envelope"></i> cadetinitiative1@gmail.com</p>
                        <p><i class="fas fa-phone"></i> +234 701-1888-770</p>
                    </div>
                </div>

                <!-- Column 2: Strategic Links -->
                <div class="footer-links">
                    <h4>Quick Access</h4>
                    <ul>
                        <li><a href="/index.html"><i class="fa-solid fa-chevron-right"></i> Home Portal</a></li>
                        <li><a href="/recruit-reg.html"><i class="fa-solid fa-chevron-right"></i> Recruit Registration</a></li>
                        <li><a href="/member-validation.html"><i class="fa-solid fa-chevron-right"></i> Member Validation</a></li>
                        <li><a href="/old-member.html"><i class="fa-solid fa-chevron-right"></i> Member Revalidation</a></li>
                    </ul>
                </div>

                <!-- Column 3: Social Connectivity -->
                <div class="footer-social">
                    <h4>Stay Connected</h4>
                    <p class="social-text">Follow our mission across our official channels.</p>
                    <div class="social-icons">
                        <a href="https://www.facebook.com/share/17sJmwQRfN/" target="_blank" title="Facebook">
                            <i class="fab fa-facebook-f"></i>
                        </a>
                        <a href="https://www.instagram.com/cadetinitiative/" target="_blank" title="Instagram">
                            <i class="fab fa-instagram"></i>
                        </a>
                        <a href="https://x.com/cadetinitiative" target="_blank" title="X">
                            <i class="fab fa-x-twitter"></i>
                        </a>
                        <a href="https://whatsapp.com/channel/0029VaBt7fA9sBI0CF5WLL37" target="_blank" title="Channel">
                            <i class="fab fa-whatsapp"></i>
                        </a>
                    </div>
                </div>
            </div>

            <div class="footer-bottom">
                <p>&copy; ${new Date().getFullYear()} CADETI | Developed by Oracle Tek GS. All rights reserved.</p>
            </div>
        </div>

        <!-- Floating WhatsApp Button -->
        <a href="https://wa.me/message/AZ2WMBRJHD2QJ1" class="whatsapp-float" target="_blank">
            <i class="fab fa-whatsapp"></i>
            <span>Official Support</span>
        </a>
    </footer>
    `;

    document.body.insertAdjacentHTML('beforeend', footerHTML);
}