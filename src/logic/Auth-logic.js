import { auth, db, getShadowEmail, SCRIPT_URL } from '../config.js';
import { browserSessionPersistence, createUserWithEmailAndPassword, onAuthStateChanged, setPersistence, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { addDoc, collection, doc, getDoc, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const authSessionReady = setPersistence(auth, browserSessionPersistence)
    .catch((error) => console.error('Session persistence setup failed:', error));

const SESSION_START_KEY = 'cadeti_session_started_at';
const SESSION_LAST_ACTIVITY_KEY = 'cadeti_session_last_activity_at';
const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_SESSION_MS = 2 * 60 * 60 * 1000;

let sessionMonitorId = null;
let sessionTrackingBound = false;

function now() {
    return Date.now();
}

function markSessionStarted() {
    const timestamp = String(now());
    sessionStorage.setItem(SESSION_START_KEY, timestamp);
    sessionStorage.setItem(SESSION_LAST_ACTIVITY_KEY, timestamp);
}

function touchSessionActivity() {
    if (!auth.currentUser) return;
    sessionStorage.setItem(SESSION_LAST_ACTIVITY_KEY, String(now()));
}

function clearSessionTracking() {
    sessionStorage.removeItem(SESSION_START_KEY);
    sessionStorage.removeItem(SESSION_LAST_ACTIVITY_KEY);
}

function getSessionTimes() {
    const startedAt = Number(sessionStorage.getItem(SESSION_START_KEY) || 0);
    const lastActivityAt = Number(sessionStorage.getItem(SESSION_LAST_ACTIVITY_KEY) || 0);
    return { startedAt, lastActivityAt };
}

async function expireSession(reason) {
    clearSessionTracking();
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Session expiry logout failed:', error);
    }

    const onProtectedPage = window.location.pathname.toLowerCase().includes('admin') || window.location.pathname.toLowerCase().includes('dashboard');
    if (onProtectedPage) {
        alert(reason === 'idle'
            ? 'Your session expired due to inactivity. Please sign in again.'
            : 'Your secure session expired. Please sign in again.');
        window.location.replace('/login.html');
    }
}

function stopSessionMonitor() {
    if (sessionMonitorId) {
        window.clearInterval(sessionMonitorId);
        sessionMonitorId = null;
    }
}

function startSessionMonitor() {
    stopSessionMonitor();

    if (!sessionTrackingBound) {
        ['click', 'keydown', 'mousemove', 'scroll', 'touchstart'].forEach((eventName) => {
            window.addEventListener(eventName, touchSessionActivity, { passive: true });
        });
        sessionTrackingBound = true;
    }

    sessionMonitorId = window.setInterval(() => {
        if (!auth.currentUser) {
            stopSessionMonitor();
            return;
        }

        const { startedAt, lastActivityAt } = getSessionTimes();
        const currentTime = now();

        if (!startedAt || !lastActivityAt) {
            markSessionStarted();
            return;
        }

        if (currentTime - lastActivityAt > IDLE_TIMEOUT_MS) {
            stopSessionMonitor();
            expireSession('idle');
            return;
        }

        if (currentTime - startedAt > MAX_SESSION_MS) {
            stopSessionMonitor();
            expireSession('max');
        }
    }, 30 * 1000);
}

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

function getAdminHome(adminData = {}) {
    const role = String(adminData.role || adminData.Role || '').trim().toLowerCase();
    return role.includes('media') ? '/admin-media.html' : '/admin.html';
}

function isMediaAdmin(adminData = {}) {
    const role = String(adminData.role || adminData.Role || '').trim().toLowerCase();
    return role.includes('media');
}

function getSheetValue(row = {}, keys = []) {
    for (const key of keys) {
        const value = row[key];
        if (String(value || '').trim()) return value;
    }
    return "";
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
            await authSessionReady;
            const email = userInp.includes('@') ? userInp : getShadowEmail(userInp);
            await signInWithEmailAndPassword(auth, email, passInp);
            markSessionStarted();
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
                const contactEmail = String(record["Email"] || record["Email "] || "").trim();

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
    authSessionReady.finally(() => {
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
                    clearSessionTracking();
                    stopSessionMonitor();
                    if (loader) loader.style.display = 'none';
                    return;
                }

                const hasSessionStart = sessionStorage.getItem(SESSION_START_KEY);
                if (!hasSessionStart) {
                    markSessionStarted();
                } else {
                    touchSessionActivity();
                }
                startSessionMonitor();

                const adminDoc = await getDoc(doc(db, "admins", user.uid));
                const isAdmin = adminDoc.exists();
                const adminData = isAdmin ? adminDoc.data() : {};
                const adminHome = isAdmin ? getAdminHome(adminData) : '/dashboard.html';
                const onMediaAdminPage = path.includes('admin-media');
                const onMainAdminPage = path.includes('admin.html') && !onMediaAdminPage;

                if (onLoginPage) {
                    window.location.replace(adminHome);
                    return;
                }

                if (onSignupPage) {
                    window.location.replace(adminHome);
                    return;
                }

                if (onAdminPage && !isAdmin) {
                    window.location.replace('/dashboard.html');
                    return;
                }

                if (isAdmin && isMediaAdmin(adminData) && onMainAdminPage) {
                    window.location.replace('/admin-media.html');
                    return;
                }

                if (isAdmin && !isMediaAdmin(adminData) && onMediaAdminPage) {
                    window.location.replace('/admin.html');
                    return;
                }

                if (onDashboardPage && isAdmin) {
                    window.location.replace(adminHome);
                    return;
                }
            } catch (error) {
                console.error('Auth observer error:', error);
            }

            if (onLoginPage) setLoginPending(false);
            if (onSignupPage && !window.isProcessingSignup) setSignupPending(false);
            if (loader) loader.style.display = 'none';
        });
    });
}

window.handleLogout = () => {
    if (confirm("Logout from CADETI secure session?")) {
        clearSessionTracking();
        stopSessionMonitor();
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
            await authSessionReady;
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
                passportUrl: getSheetValue(s, ["Passport URL", "Passport Url", "PassportURL", "Passport Photo", "Photo URL", "Photo"]) || "N/A",
                pdfUrl: getSheetValue(s, ["PDF URL", "PDF Url", "PDFURL"]) || "",
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

            markSessionStarted();

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
