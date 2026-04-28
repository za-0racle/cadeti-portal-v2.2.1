import { auth, db, getShadowEmail, SCRIPT_URL } from '../config.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { addDoc, collection, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

function setLoginPending(isPending) {
    const btn = document.getElementById('loginBtn');
    const loader = document.getElementById('authGuardLoader');

    if (btn) {
        btn.classList.toggle('loading', isPending);
        btn.disabled = isPending;
    }

    if (loader) {
        loader.style.display = isPending ? 'flex' : 'none';
    }
}

function setSignupPending(isPending) {
    const btn = document.getElementById('signupBtn');
    const loader = document.getElementById('authGuardLoader');

    if (btn) {
        btn.classList.toggle('loading', isPending);
        btn.disabled = isPending;
    }

    if (loader) {
        loader.style.display = isPending ? 'flex' : 'none';
    }
}

function setForgotPending(buttonId, isPending) {
    const btn = document.getElementById(buttonId);
    if (!btn) return;
    btn.classList.toggle('loading', isPending);
    btn.disabled = isPending;
}

export function initAuth() {
    const loginForm = document.getElementById('loginForm');
    const forgotPasswordLink = document.getElementById('forgotPasswordLink');
    const errorBox = document.getElementById('errorMessage');
    const forgotModal = document.getElementById('forgotPasswordModal');
    const closeForgotModal = document.getElementById('closeForgotModal');
    const verifyForgotBtn = document.getElementById('verifyForgotBtn');
    const submitForgotBtn = document.getElementById('submitForgotBtn');
    const forgotServiceInput = document.getElementById('forgotServiceNum');
    const forgotDetails = document.getElementById('forgotDetails');
    const forgotMessageBox = document.getElementById('forgotMessageBox');
    let forgotCandidate = null;
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const userInp = document.getElementById('loginUser')?.value.trim() || "";
        const passInp = document.getElementById('loginPass')?.value || "";

        setLoginPending(true);
        if (errorBox) {
            errorBox.style.display = 'none';
            errorBox.innerText = "";
        }

        try {
            const email = userInp.includes('@') ? userInp : getShadowEmail(userInp);
            await signInWithEmailAndPassword(auth, email, passInp);
        } catch (error) {
            setLoginPending(false);
            if (errorBox) {
                errorBox.style.display = 'block';
                errorBox.innerText = "Access Denied: Invalid Credentials.";
            }
        }
    });

    if (forgotPasswordLink) {
        forgotPasswordLink.addEventListener('click', () => {
            const seededServiceNum = document.getElementById('loginUser')?.value.trim() || "";
            forgotCandidate = null;
            if (forgotServiceInput) forgotServiceInput.value = seededServiceNum.includes('@') ? "" : seededServiceNum;
            if (forgotDetails) forgotDetails.style.display = 'none';
            if (submitForgotBtn) submitForgotBtn.style.display = 'none';
            if (forgotMessageBox) forgotMessageBox.style.display = 'none';
            if (forgotModal) forgotModal.style.display = 'flex';
        });
    }

    if (closeForgotModal) {
        closeForgotModal.addEventListener('click', () => {
            if (forgotModal) forgotModal.style.display = 'none';
        });
    }

    if (forgotModal) {
        forgotModal.addEventListener('click', (e) => {
            if (e.target === forgotModal) forgotModal.style.display = 'none';
        });
    }

    if (verifyForgotBtn) {
        verifyForgotBtn.addEventListener('click', async () => {
            const serviceNum = forgotServiceInput?.value.trim() || "";

            if (!serviceNum || serviceNum.includes('@')) {
                if (forgotMessageBox) {
                    forgotMessageBox.style.display = 'block';
                    forgotMessageBox.style.background = '#fff7ed';
                    forgotMessageBox.style.color = '#9a3412';
                    forgotMessageBox.innerText = "Enter a valid Service Number to continue.";
                }
                return;
            }

            try {
                setForgotPending('verifyForgotBtn', true);
                if (forgotMessageBox) forgotMessageBox.style.display = 'none';

                const response = await fetch(`${SCRIPT_URL}?action=searchByServiceNumber&serviceNumber=${encodeURIComponent(serviceNum)}`);
                const result = await response.json();

                if (result.status !== "success") {
                    throw new Error("Service Number not found.");
                }

                const record = result.data || {};
                const officerName = [record["Surname"], record["First Name"]].filter(Boolean).join(' ').trim() || serviceNum;
                const contactEmail = record["Email"] || record["Email "] || "";

                if (!contactEmail) {
                    throw new Error("No email address is attached to this service record.");
                }

                forgotCandidate = {
                    serviceNumber: serviceNum,
                    officerName,
                    contactEmail
                };

                document.getElementById('forgotOfficerName').innerText = officerName;
                document.getElementById('forgotOfficerEmail').innerText = contactEmail;
                if (forgotDetails) forgotDetails.style.display = 'block';
                if (submitForgotBtn) submitForgotBtn.style.display = 'flex';
            } catch (error) {
                forgotCandidate = null;
                if (forgotDetails) forgotDetails.style.display = 'none';
                if (submitForgotBtn) submitForgotBtn.style.display = 'none';
                if (forgotMessageBox) {
                    forgotMessageBox.style.display = 'block';
                    forgotMessageBox.style.background = '#fee2e2';
                    forgotMessageBox.style.color = '#b91c1c';
                    forgotMessageBox.innerText = error.message || "Unable to verify service record.";
                }
            } finally {
                setForgotPending('verifyForgotBtn', false);
            }
        });
    }

    if (submitForgotBtn) {
        submitForgotBtn.addEventListener('click', async () => {
            if (!forgotCandidate) return;

            try {
                setForgotPending('submitForgotBtn', true);
                await addDoc(collection(db, "password_resets"), {
                    serviceNumber: forgotCandidate.serviceNumber,
                    officerName: forgotCandidate.officerName,
                    contactEmail: forgotCandidate.contactEmail,
                    status: "pending",
                    requestedAt: serverTimestamp()
                });

                if (forgotMessageBox) {
                    forgotMessageBox.style.display = 'block';
                    forgotMessageBox.style.background = '#f0fdf4';
                    forgotMessageBox.style.color = '#166534';
                    forgotMessageBox.innerText = `Recovery request sent. Admin approval is required before a temporary password is delivered to ${forgotCandidate.contactEmail}.`;
                }
                if (submitForgotBtn) submitForgotBtn.style.display = 'none';
            } catch (error) {
                if (forgotMessageBox) {
                    forgotMessageBox.style.display = 'block';
                    forgotMessageBox.style.background = '#fee2e2';
                    forgotMessageBox.style.color = '#b91c1c';
                    forgotMessageBox.innerText = error.message || "Unable to submit password recovery request.";
                }
            } finally {
                setForgotPending('submitForgotBtn', false);
            }
        });
    }
}

export function startAuthObserver() {
    onAuthStateChanged(auth, async (user) => {
        const path = window.location.pathname.toLowerCase();
        const loader = document.getElementById('authGuardLoader');
        const onLoginPage = path.includes('login');
        const onSignupPage = path.includes('signup');
        const onAdminPage = path.includes('admin');
        const onDashboardPage = path.includes('dashboard');

        try {
            if (!user) {
                if (onAdminPage || onDashboardPage) {
                    window.location.replace('/login.html');
                    return;
                }

                if (onLoginPage) setLoginPending(false);
                if (onSignupPage && !window.isProcessingSignup) setSignupPending(false);
                if (loader) loader.style.display = 'none';
                return;
            }

            const adminDoc = await getDoc(doc(db, "admins", user.uid));
            const isAdmin = adminDoc.exists();

            if (onLoginPage) {
                window.location.replace(isAdmin ? '/admin.html' : '/dashboard.html');
                return;
            }

            if (onSignupPage) {
                window.location.replace(isAdmin ? '/admin.html' : '/dashboard.html');
                return;
            }

            if (onAdminPage && !isAdmin) {
                window.location.replace('/dashboard.html');
                return;
            }

            if (onDashboardPage && isAdmin) {
                window.location.replace('/admin.html');
                return;
            }
        } catch (error) {
            console.error('Auth observer error:', error);
        }

        if (onLoginPage) setLoginPending(false);
        if (onSignupPage && !window.isProcessingSignup) setSignupPending(false);
        if (loader) loader.style.display = 'none';
    });
}

window.handleLogout = () => {
    if (confirm("Logout from CADETI secure session?")) {
        signOut(auth)
            .then(() => window.location.replace('/login.html'))
            .catch((error) => {
                console.error('Logout failed:', error);
                alert("Logout failed. Please try again.");
            });
    }
};

window.isProcessingSignup = false;

export function initSignup() {
    const signupForm = document.getElementById('signupForm');
    if (!signupForm) return;

    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const serviceNum = document.getElementById('signupServiceNum')?.value.trim() || "";
        const pass = document.getElementById('signupPassword')?.value || "";
        const confirmPass = document.getElementById('confirmPassword')?.value || "";
        const msgBox = document.getElementById('messageBox');

        if (!serviceNum || !pass || !confirmPass) {
            if (msgBox) {
                msgBox.style.display = 'block';
                msgBox.style.color = 'red';
                msgBox.innerText = "Please complete all fields.";
            }
            setSignupPending(false);
            return;
        }

        if (pass !== confirmPass) {
            if (msgBox) {
                msgBox.style.display = 'block';
                msgBox.style.color = 'red';
                msgBox.innerText = "Error: Passwords do not match.";
            }
            setSignupPending(false);
            return;
        }

        setSignupPending(true);
        if (msgBox) {
            msgBox.style.display = 'none';
            msgBox.innerText = "";
        }

        try {
            const response = await fetch(`${SCRIPT_URL}?action=searchByServiceNumber&serviceNumber=${encodeURIComponent(serviceNum)}`);
            const result = await response.json();

            if (result.status !== "success") {
                throw new Error("Service Number not found. Ensure you are officially validated.");
            }

            window.isProcessingSignup = true;

            const shadowEmail = getShadowEmail(serviceNum);
            const userCred = await createUserWithEmailAndPassword(auth, shadowEmail, pass);
            const uid = userCred.user.uid;

            const s = result.data;
            const profileData = {
                firstName: s["First Name"] || "",
                surname: s["Surname"] || "",
                otherName: s["Other Name"] || "",
                address: s["Residential Address"] || "",
                occupation: s["Occupation"] || "",
                gender: s["Gender"] || "",
                phone: s["Phone Number"] || "",
                email: s["Email"] || s["Email "] || "",
                serviceNumber: serviceNum,
                rank: s["Rank"] || "Officer",
                department: s["Department"] || "",
                postHeld: s["Post Held"] || "",
                state: s["State Command"] || "",
                area: s["Area Command"] || "",
                nokName: s["NOK Full Name"] || "",
                nokRelation: s["NOK Relationship"] || s["NOK relationship"] || "",
                nokPhone: s["NOK Phone Number"] || "",
                nokAddress: s["NOK Residential Address"] || "",
                passportUrl: s["Passport URL"] || "N/A",
                pdfUrl: s["PDF URL"] || "",
                uniqueID: s["Unique ID"] || "",
                userId: uid,
                activatedAt: new Date().toISOString()
            };

            await setDoc(doc(db, "users", uid), profileData);
            
            if (msgBox) {
                msgBox.style.display = 'block';
                msgBox.style.color = "green";
                msgBox.innerText = "Portal Activated! Preparing Dashboard...";
            }

            setTimeout(() => {
                window.isProcessingSignup = false;
                window.location.href = '/dashboard.html';
            }, 2500);

        } catch (error) {
            window.isProcessingSignup = false; 
            setSignupPending(false);
            if (msgBox) {
                msgBox.style.display = 'block';
                msgBox.style.color = "red";
                msgBox.innerText = error.message;
            }
        }
    });
}
