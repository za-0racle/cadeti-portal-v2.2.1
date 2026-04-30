import { SCRIPT_URL } from '../config.js';

export function initContactPage() {
    // 1. FAQ ACCORDION LOGIC
    const faqQuestions = document.querySelectorAll('.faq-question');
    
    faqQuestions.forEach(btn => {
        btn.onclick = () => {
            const item = btn.parentElement;
            const isActive = item.classList.contains('active');
            
            // Close all
            document.querySelectorAll('.faq-item').forEach(el => el.classList.remove('active'));
            
            // Toggle current
            if (!isActive) item.classList.add('active');
        };
    });

    // 2. CONTACT FORM SUBMISSION
    const form = document.getElementById('contactMsgForm');
    const submitBtn = document.getElementById('submitMsgBtn');
    const statusBox = document.getElementById('msgStatus');

    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            submitBtn.classList.add('loading');
            submitBtn.disabled = true;
            statusBox.style.display = 'none';

            const formData = {
                action: 'sendInquiry',
                name: document.getElementById('msgName').value,
                email: document.getElementById('msgEmail').value,
                subject: document.getElementById('msgSubject').value,
                message: document.getElementById('msgBody').value,
                timestamp: new Date().toLocaleString()
            };

            try {
                // Note: We use the same Google App Script URL
                await fetch(SCRIPT_URL, {
                    method: "POST",
                    mode: "no-cors",
                    headers: { "Content-Type": "text/plain" },
                    body: JSON.stringify(formData)
                });

                statusBox.style.display = 'block';
                statusBox.style.background = '#dcfce7';
                statusBox.style.color = '#166534';
                statusBox.innerText = "Message transmitted successfully. HQ will contact you.";
                form.reset();

            } catch (err) {
                statusBox.style.display = 'block';
                statusBox.style.background = '#fee2e2';
                statusBox.innerText = "Error: Connection failed.";
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });
    }
}