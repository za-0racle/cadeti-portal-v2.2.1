import { db, SCRIPT_URL } from '../config.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const HQ_EMAIL = "cadetinitiative1@gmail.com";

async function sendInquiryEmail(payload) {
    await fetch(SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
            action: "sendInquiry",
            type: "contact",
            to: HQ_EMAIL,
            ...payload
        })
    });
}

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
                name: document.getElementById('msgName').value.trim(),
                email: document.getElementById('msgEmail').value.trim(),
                subject: document.getElementById('msgSubject').value.trim(),
                message: document.getElementById('msgBody').value.trim(),
                timestamp: new Date().toLocaleString()
            };

            try {
                await addDoc(collection(db, "contact_messages"), {
                    ...formData,
                    to: HQ_EMAIL,
                    status: "submitted",
                    createdAt: serverTimestamp()
                });

                await sendInquiryEmail(formData);

                statusBox.style.display = 'block';
                statusBox.style.background = '#dcfce7';
                statusBox.style.color = '#166534';
                statusBox.innerText = "Message submitted successfully. HQ will contact you.";
                form.reset();

            } catch (err) {
                console.error("Contact submission failed:", err);
                statusBox.style.display = 'block';
                statusBox.style.background = '#fee2e2';
                statusBox.style.color = '#b91c1c';
                statusBox.innerText = "Error: Message could not be submitted. Please try again or use the WhatsApp contact.";
            } finally {
                submitBtn.classList.remove('loading');
                submitBtn.disabled = false;
            }
        });
    }
}
