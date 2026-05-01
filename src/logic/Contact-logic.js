import { db, FORMSPREE_ENDPOINT } from '../config.js';
import { addDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const HQ_EMAIL = "cadetinitiative1@gmail.com";

async function sendInquiryEmail(payload) {
    const response = await fetch(FORMSPREE_ENDPOINT, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json"
        },
        body: JSON.stringify({
            name: payload.name,
            email: payload.email,
            subject: payload.subject,
            message: payload.message,
            _subject: `CADETI Web Inquiry: ${payload.subject}`,
            source: "CADETI Contact Page",
            submittedAt: payload.timestamp
        })
    });

    if (!response.ok) {
        let message = "Inquiry email could not be sent.";
        try {
            const result = await response.json();
            message = result?.errors?.[0]?.message || result?.error || message;
        } catch (error) {
            // Keep the friendly fallback message when Formspree returns non-JSON.
        }
        throw new Error(message);
    }
}

async function archiveInquiry(payload) {
    try {
        await addDoc(collection(db, "contact_messages"), {
            ...payload,
            to: HQ_EMAIL,
            status: "submitted",
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.warn("Contact message was emailed, but Firestore archive failed:", error);
    }
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
                await sendInquiryEmail(formData);
                archiveInquiry(formData);

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
