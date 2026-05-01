import { SCRIPT_URL } from '../config';

let locationsData = {};
let passportBase64 = "";
let recruitFullData = {}; 
let timerStarted = false;
const TIMER_SECONDS = 15;

function resetAreaSelect() {
    const areaSelect = document.getElementById("area");
    if (!areaSelect) return;
    areaSelect.innerHTML = '<option value="">Select Area Command</option>';
    areaSelect.value = "";
}

function populateAreaSelect(stateCode) {
    const areaSelect = document.getElementById("area");
    resetAreaSelect();

    if (!areaSelect || !stateCode || !locationsData[stateCode]) return;

    const areas = locationsData[stateCode].areas || {};
    Object.keys(areas).sort().forEach(code => {
        areaSelect.add(new Option(`${areas[code]} (${code})`, code));
    });
}

// ==========================================
// 1. GLOBAL EVENT DELEGATION (Restored from your original)
// ==========================================
document.addEventListener('change', (e) => {
    // A. DYNAMIC AREA DROPDOWN
    if (e.target.id === 'state') {
        const stateCode = e.target.value;
        populateAreaSelect(stateCode);
    }

    // B. DUAL ID TRIGGER
    if (['state', 'area', 'intakeYear', 'serialNumber'].includes(e.target.id)) {
        if (document.getElementById('serviceNumber')) generateDualID();
    }
});

// For number inputs (Serial)
document.addEventListener('input', (e) => {
    if (e.target.id === 'serialNumber' && document.getElementById('serviceNumber')) {
        generateDualID();
    }
});

// ==========================================
// 2. SHARED ENGINES (Passport, Locations, Timer)
// ==========================================

async function fetchLocations() {
    try {
        const response = await fetch(`${SCRIPT_URL}?action=getLocations`);
        const payload = await response.json();
        const data = Array.isArray(payload)
            ? payload
            : Array.isArray(payload?.data)
                ? payload.data
                : [];

        locationsData = {}; 
        data.forEach(row => {
            const sCode = String(row.StateCode ?? row.stateCode ?? row.state_code ?? "").trim();
            const sName = String(row.StateName ?? row.stateName ?? row.state_name ?? "").trim();
            const aCode = String(row.AreaCode ?? row.areaCode ?? row.area_code ?? "").trim();
            const aName = String(row.AreaName ?? row.areaName ?? row.area_name ?? "").trim();

            if (!sCode || !aCode) return;
            if (!locationsData[sCode]) locationsData[sCode] = { name: sName || sCode, areas: {} };
            locationsData[sCode].areas[aCode] = aName || aCode;
        });
        
        const stateSelect = document.getElementById("state");
        if (stateSelect) {
            stateSelect.innerHTML = '<option value="">Select State Command</option>';
            Object.keys(locationsData).sort().forEach(code => {
                stateSelect.add(new Option(`${locationsData[code].name} (${code})`, code));
            });
        }

        resetAreaSelect();
    } catch (err) { console.error("Sync Error:", err); }
}

function handlePassportUpload(e) {
    const file = e.target.files[0];
    const preview = document.getElementById('passportPreview');
    if (file && file.size <= 5242880) {
        const reader = new FileReader();
        reader.onload = (event) => {
            if (preview) preview.innerHTML = `<img src="${event.target.result}" style="width:100%; height:100%; object-fit:cover;">`;
            passportBase64 = event.target.result.split(',')[1];
        };
        reader.readAsDataURL(file);
    } else { alert("Photo too large (Max 5MB)"); }
}

function startTCTimer() {
    const tcArea = document.getElementById('tcArea');
    if (tcArea) tcArea.style.display = 'block';
    if (timerStarted) return;
    timerStarted = true;
    let left = TIMER_SECONDS;
    const tick = setInterval(() => {
        left--;
        const bar = document.getElementById('tbar');
        const countdown = document.getElementById('tcountdown');
        if (bar) bar.style.width = ((TIMER_SECONDS - left) / TIMER_SECONDS * 100) + '%';
        if (countdown) countdown.textContent = left;
        if (left <= 0) {
            clearInterval(tick);
            if (document.getElementById('agreeCheck')) document.getElementById('agreeCheck').disabled = false;
            if (document.getElementById('tlabel')) document.getElementById('tlabel').innerHTML = '<b style="color:green;">Identity Verified</b>';
        }
    }, 1000);
}

// ==========================================
// 3. PAGE INITIALIZERS
// ==========================================

export async function initRecruit() {
    await fetchLocations();
    attachGlobalFormListeners('recruitForm');
}

export async function initRevalidation() {
    await fetchLocations();
    populateRanks();
    populateYears(false);
    attachGlobalFormListeners('cadetiForm');
}

export async function initValidation() {
    const lookupBtn = document.getElementById('lookupBtn');
    if (lookupBtn) lookupBtn.onclick = () => lookupRecruit();
    // Validation Form is hidden initially, but we set listeners for when it appears
    attachGlobalFormListeners('validationForm');
}

function attachGlobalFormListeners(formId) {
    const form = document.getElementById(formId);
    if (form) form.addEventListener('submit', handleFormSubmission);
    
    const passInput = document.getElementById('passportInput');
    if (passInput) passInput.addEventListener('change', handlePassportUpload);

    const openTCBtn = document.getElementById('openTCBtn');
    if (openTCBtn) openTCBtn.addEventListener('click', startTCTimer);

    const agreeCheck = document.getElementById('agreeCheck');
    if (agreeCheck) {
        agreeCheck.addEventListener('change', (e) => {
            const btn = document.getElementById('submitBtn');
            if (btn) btn.disabled = !e.target.checked;
        });
    }
}

// ==========================================
// 4. CORE LOGIC (Dual ID, Search, Submit)
// ==========================================

function generateDualID() {
    const s = document.getElementById('state')?.value;
    const a = document.getElementById('area')?.value;
    const y = document.getElementById('intakeYear')?.value;
    const sn = document.getElementById('serialNumber')?.value;
    const output = document.getElementById('serviceNumber');
    if (!s || !a || !y || !sn || !output) return;

    const padded = sn.toString().padStart(3, "0");
    const timeCode = ("0000" + (Math.floor(Date.now() / 1000) % 10000)).slice(-4);
    output.value = `CAD/${s}/${a}/${y}/${padded}`;
    window.generatedUniqueID = `${s}${a}${y}${timeCode}${padded}`;
}

async function lookupRecruit() {
    const recruitID = document.getElementById('searchRecruitID').value.trim();
    const lookupBtn = document.getElementById('lookupBtn');
    if (!recruitID) return alert("Enter REC ID");

    lookupBtn.disabled = true;
    lookupBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Finding...';

    try {
        const response = await fetch(`${SCRIPT_URL}?action=searchRecruit&id=${encodeURIComponent(recruitID)}`);
        const result = await response.json();

        if (result.status === "success") {
            recruitFullData = result.data;
            // Populate Read-Only using EXACT ORIGINAL KEYS
            document.getElementById('dispName').value = `${result.data["Surname"]}, ${result.data["First Name"]}`;
            document.getElementById('dispPhone').value = result.data["Phone Number"] || "N/A";
            document.getElementById('dispEmail').value = result.data["Email"] || result.data["email"] || "N/A";
            document.getElementById('dispGender').value = result.data["Gender"] || "N/A";
            document.getElementById('dispAddress').value = result.data["Residential Address"] || "N/A";
            document.getElementById('dispOccupation').value = result.data["Occupation"] || "N/A";
            document.getElementById('dispDept').value = result.data["Department"] || "N/A";
            document.getElementById('dispNokName').value = result.data["NOK Full Name"] || "N/A";
            document.getElementById('dispNokPhone').value = result.data["NOK Phone Number"] || "N/A";

            document.getElementById('searchStep').style.display = 'none';
            document.getElementById('validationForm').style.display = 'block';
            await fetchLocations(); 
            startTCTimer();
        } else { alert("Recruit ID not found."); }
    } catch (err) { alert("Fetch error."); }
    finally { lookupBtn.disabled = false; lookupBtn.innerText = "Verify ID"; }
}

async function handleFormSubmission(e) {
    e.preventDefault();
    const type = document.getElementById('regType').value;
    const isVal = type === "Validation";
    const submitBtn = document.getElementById('submitBtn');

    if (!passportBase64) return alert("Please upload passport photograph.");
    
    submitBtn.disabled = true;
    submitBtn.classList.add("loading");

    const getVal = (id) => document.getElementById(id) ? document.getElementById(id).value : "";

    // --- RESTORED: EXACT KEY MAPPING FOR GOOGLE SHEET ---
    let formData = {
        regType: type,
        passportData: passportBase64,
        firstName: isVal ? recruitFullData["First Name"] : getVal("firstName"),
        surname: isVal ? recruitFullData["Surname"] : getVal("surname"),
        otherName: isVal ? (recruitFullData["Other Name"] || recruitFullData["otherName"]) : getVal("otherName"),
        address: isVal ? recruitFullData["Residential Address"] : getVal("address"),
        occupation: isVal ? recruitFullData["Occupation"] : getVal("occupation"),
        email: isVal ? (document.getElementById('dispEmail')?.value) : getVal("email"),
        phone: isVal ? recruitFullData["Phone Number"] : getVal("phone"),
        gender: isVal ? recruitFullData["Gender"] : document.querySelector('input[name="gender"]:checked')?.value,
        department: isVal ? recruitFullData["Department"] : getVal("department"),
        nokName: isVal ? recruitFullData["NOK Full Name"] : getVal("nokName"),
        nokRelation: isVal ? (recruitFullData["NOK Relationship"] || recruitFullData["NOK relationship"]) : getVal("nokRelation"),
        nokPhone: isVal ? recruitFullData["NOK Phone Number"] : getVal("nokPhone"),
        nokAddress: isVal ? recruitFullData["NOK Residential Address"] : getVal("nokAddress"),
        state: locationsData[getVal('state')]?.name || getVal('state'),
        area: locationsData[getVal('state')]?.areas[getVal('area')] || getVal('area'),
        stateCode: getVal('state'),
        areaCode: getVal('area')
    };

    if (type !== "Recruit") {
        formData.uniqueID = window.generatedUniqueID;
        formData.serviceNumber = getVal('serviceNumber');
        formData.rank = getVal('rank');
        formData.intakeYear = getVal('intakeYear');
        formData.serialNumber = getVal('serialNumber');
        formData.areaOC = getVal("areaOC");
        formData.postHeld = getVal("postHeld") || "Member";
        if (isVal) formData.originalID = document.getElementById('searchRecruitID').value;
    }

    try {
        const response = await fetch(SCRIPT_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify(formData)
        });
        const result = await response.json();
        if (result.status !== "success") {
            throw new Error(result.message || "Submission failed.");
        }
        alert("Submission Successful! Documents sent to your email.");
        document.getElementById('successMessage').style.display = "block";
        e.target.reset();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) { alert(err.message || "Submission failed."); submitBtn.disabled = false; }
    finally { submitBtn.classList.remove("loading"); }
}

function populateRanks() {
    const r = document.getElementById('rank');
    if (!r) return;
    const ranks = ["Assistant Brigade Commander", "Commander", "Deputy Commander", "Assistant Commander", "Chief Superintendent", "Superintendent", "Deputy Superintendent", "Assistant Superintendent I", "Assistant Superintendent II", "Inspector", "Deputy Inspector", "Assistant Inspector", "Staff Sergeant", "Sergeant", "Corporal", "Lance Corporal", "Private"];
    r.innerHTML = '<option value="">Select Rank</option>';
    ranks.forEach(rank => r.add(new Option(rank, rank)));
}

function populateYears(isVal) {
    const y = document.getElementById('intakeYear');
    if (!y) return;
    const years = isVal ? ["024", "025", "026"] : ["010","011","012","013","014","015","016","017","018","019","020","021","022","023","024","025","026"];
    y.innerHTML = '<option value="">Year</option>';
    years.forEach(year => y.add(new Option(year, year)));
}
