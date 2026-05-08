const LOGO_IMAGE = '/logo.png';
const COAT_OF_ARMS_IMAGE = '/coat-of-arm.png';
const ID_CARD_LIBS = {
    htmlToImage: 'https://cdn.jsdelivr.net/npm/html-to-image@1.11.13/dist/html-to-image.js',
    barcode: 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
    qrcode: 'https://cdn.jsdelivr.net/npm/qr-code-styling@1.9.2/lib/qr-code-styling.js'
};

function loadScriptOnce(src, globalName) {
    return new Promise((resolve, reject) => {
        if (globalName && window[globalName]) {
            resolve(window[globalName]);
            return;
        }

        const existing = document.querySelector(`script[src="${src}"]`);
        if (existing) {
            existing.addEventListener('load', () => resolve(globalName ? window[globalName] : true), { once: true });
            existing.addEventListener('error', reject, { once: true });
            return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.onload = () => resolve(globalName ? window[globalName] : true);
        script.onerror = () => reject(new Error(`Unable to load ID card library: ${src}`));
        document.head.appendChild(script);
    });
}

async function ensureIdCardFormatLibraries() {
    await Promise.all([
        loadScriptOnce(ID_CARD_LIBS.htmlToImage, 'htmlToImage'),
        loadScriptOnce(ID_CARD_LIBS.barcode, 'JsBarcode'),
        loadScriptOnce(ID_CARD_LIBS.qrcode, 'QRCodeStyling')
    ]);
}

function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error('Unable to render QR code.'));
        reader.readAsDataURL(blob);
    });
}

async function makeQrDataUrl(value) {
    const qr = new window.QRCodeStyling({
        width: 120,
        height: 120,
        data: String(value || 'CADETI'),
        margin: 2,
        dotsOptions: { color: '#000000', type: 'square' },
        backgroundOptions: { color: '#ffffff' }
    });
    const blob = await qr.getRawData('png');
    return blobToDataUrl(blob);
}

function verificationUrl(serviceNumber) {
    const origin = window.location.origin || '';
    return `${origin}/verify-id.html?sn=${encodeURIComponent(serviceNumber || '')}`;
}

function value(personnel, ...keys) {
    for (const key of keys) {
        const next = personnel?.[key];
        if (next !== undefined && next !== null && String(next).trim()) return String(next).trim();
    }
    return '';
}

function escapeHtml(input) {
    return String(input || '').replace(/[&<>"']/g, (char) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[char]));
}

function imageUrl(input) {
    const cleanUrl = String(input || '').trim();
    return cleanUrl && cleanUrl !== 'N/A' ? cleanUrl : '';
}

function uppercaseValue(input) {
    return String(input || '').trim().toUpperCase();
}

function commandName(input, suffixPattern) {
    return uppercaseValue(input).replace(suffixPattern, '').trim() || 'N/A';
}

function extractDriveFileId(url) {
    const cleanUrl = imageUrl(url);
    if (!cleanUrl || !cleanUrl.includes('drive.google.com')) return '';

    const fileId = cleanUrl.match(/[-\w]{25,}/);
    return fileId?.[0] || '';
}

function imageCandidates(url) {
    const cleanUrl = imageUrl(url);
    if (!cleanUrl) return [];

    const driveId = extractDriveFileId(cleanUrl);
    if (driveId) {
        return [
            `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
            `https://drive.google.com/uc?export=view&id=${driveId}`,
            `https://lh3.googleusercontent.com/d/${driveId}=w1000`,
            cleanUrl
        ];
    }

    return [cleanUrl];
}

function escapeAttr(input) {
    return escapeHtml(input).replace(/`/g, '&#96;');
}

function profileImageMarkup(src, className, alt) {
    const candidates = imageCandidates(src);
    if (!candidates.length) return '';

    const encodedCandidates = escapeAttr(JSON.stringify(candidates));

    return `<img src="${escapeHtml(candidates[0])}" class="${className}" alt="${escapeHtml(alt)}" data-image-candidates='${encodedCandidates}' data-image-index="0" referrerpolicy="no-referrer" onerror="const list=JSON.parse(this.dataset.imageCandidates||'[]'); const next=(Number(this.dataset.imageIndex)||0)+1; if(list[next]){ this.dataset.imageIndex=String(next); this.src=list[next]; }">`;
}

function downloadDataUrl(dataUrl, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = dataUrl;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
}

function normalizePersonnel(personnel = {}) {
    const surname = value(personnel, 'surname', 'Surname');
    const firstName = value(personnel, 'firstName', 'First Name');
    const otherName = value(personnel, 'otherName', 'Middle Name', 'Other Name');
    const uniqueID = value(personnel, 'uniqueID', 'Unique ID', 'id') || value(personnel, 'serviceNumber', 'Service Number');

    return {
        uniqueID,
        surname,
        firstName,
        otherName,
        fullName: uppercaseValue(value(personnel, 'fullName') || [surname, firstName, otherName].filter(Boolean).join(' ')),
        rank: uppercaseValue(value(personnel, 'rank', 'Rank') || 'Officer'),
        serviceNumber: uppercaseValue(value(personnel, 'serviceNumber', 'Service Number') || uniqueID || 'CADETI'),
        state: commandName(value(personnel, 'state', 'State Command', 'State'), /\s+(STATE|STATE COMMAND)$/),
        area: commandName(value(personnel, 'area', 'Area Command', 'Area'), /\s+(AREA|AREA COMMAND)$/),
        postHeld: uppercaseValue(value(personnel, 'postHeld', 'Post Held') || 'N/A'),
        passportUrl: imageUrl(value(personnel, 'passportUrl', 'passportURL', 'Passport URL', 'Passport Url', 'PassportURL', 'Passport Photo', 'Passport Photo URL', 'Uploaded Passport', 'photoUrl', 'photoURL', 'Photo URL', 'photo', 'passport')),
        signatureUrl: imageUrl(value(personnel, 'signatureUrl', 'signatureURL', 'Signature URL', 'Signature Url', 'SignatureURL', 'Uploaded Signature', 'Holder Signature URL', 'holderSignatureUrl', 'signature')),
        authoritySignatureUrl: imageUrl(value(personnel, 'authoritySignatureUrl', 'authorisedSignatureUrl', 'authorizedSignatureUrl'))
    };
}

function safeFilePart(input) {
    return String(input || 'officer').replace(/[^\w-]+/g, '_');
}

export async function generateIDCard(personnel) {
    const data = normalizePersonnel(personnel);
    document.getElementById('idCardModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'idCardModal';
    modal.className = 'modal-overlay id-card-modal';

    const barcodeId = `barcodeTarget-${Date.now()}`;

    modal.innerHTML = `
        <div class="modal-card id-card-preview-container">
            <div class="modal-header">
                <h3>Identity Card Preview</h3>
                <button type="button" class="id-card-close" aria-label="Close ID card preview">&times;</button>
            </div>
            
            <div class="card-display-flex">
                <div class="id-card-wrap" id="frontSide">
                    <div class="id-front-bg">
                        <img src="${LOGO_IMAGE}" class="id-watermark" alt="">
                        <div class="id-header">
                            <div class="logos">
                                <img src="${LOGO_IMAGE}" class="logo-main" alt="CADETI logo">
                                <img src="${COAT_OF_ARMS_IMAGE}" class="coat-arms" alt="Coat of arms">
                            </div>
                            <div class="header-text">
                                <h2 class="org-title">COMMUNITY AMBASSADOR FOR DEVELOPMENTAL AND ENGAGEMENT TECHNIQUES INITIATIVE</h2>
                                <h3 class="org-acronym">(C.A.D.E.T.I.)</h3>
                                <p class="motto">Motto: To build and secure the hope of youths in the society.</p>
                            </div>
                        </div>

                        <div class="title-banner">OFFICERS IDENTITY CARD</div>

                        <div class="photo-area">
                            <div class="photo-box${data.passportUrl ? '' : ' is-empty'}">
                                ${profileImageMarkup(data.passportUrl, 'passport-photo', 'Passport')}
                            </div>
                        </div>

                        <div class="id-details">
                            <div class="field"><span class="lbl">FULL NAME:</span> <span class="val">${escapeHtml(data.fullName)}</span></div>
                            <div class="field"><span class="lbl">RANK:</span> <span class="val">${escapeHtml(data.rank)}</span></div>
                            <div class="field"><span class="lbl">SERVICE NO:</span> <span class="val">${escapeHtml(data.serviceNumber)}</span></div>
                            <div class="field"><span class="lbl">STATE COMMAND:</span> <span class="val">${escapeHtml(data.state)}</span></div>
                            <div class="field"><span class="lbl">AREA COMMAND:</span> <span class="val">${escapeHtml(data.area)}</span></div>
                            <div class="field"><span class="lbl">POST:</span> <span class="val">${escapeHtml(data.postHeld)}</span></div>
                        </div>

                        <div class="qr-area">
                            <img src="${LOGO_IMAGE}" class="qr-code" alt="Verification QR code">
                        </div>

                        <div class="signature-area">
                            <div class="holder-signature-slot${data.signatureUrl ? '' : ' is-empty'}">
                                ${profileImageMarkup(data.signatureUrl, 'holder-sign', 'Holder signature')}
                            </div>
                            <div class="sign-line"></div>
                            <label>HOLDER'S SIGNATURE</label>
                        </div>
                    </div>
                </div>

                <div class="id-card-wrap" id="backSide">
                    <div class="id-back-bg">
                        <img src="${LOGO_IMAGE}" class="back-watermark" alt="">
                        <div class="back-header">
                            <img src="${LOGO_IMAGE}" class="back-logo" alt="CADETI logo">
                            <h2>C.A.D.E.T.I.</h2>
                        </div>
                        <div class="back-content">
                            <h4 class="property-text">PROPERTY OF THE COMMUNITY AMBASSADOR FOR DEVELOPMENTAL ENGAGEMENT TECHNIQUES INITIATIVES.</h4>
                            <p class="legal-text">This card remains the property of CADETI and must be surrendered on demand by an authorised command officer.</p>
                            <p class="legal-text">The Bearer is authorised to maintain peace, support lawful community safety operations and represent the organisation within approved duties.</p>
                            <p class="legal-text">If lost and found, please return to the nearest police station or CADETI office around you.</p>
                            
                            <div class="expiry-row">Expire: 2030</div>

                            <div class="auth-sign-block">
                                <div class="auth-signature-slot${data.authoritySignatureUrl ? '' : ' is-empty'}">
                                    ${profileImageMarkup(data.authoritySignatureUrl, 'auth-sign-img', 'Authorised signature')}
                                </div>
                                <div class="sign-line"></div>
                                <label>AUTHORISED SIGNATURE</label>
                            </div>

                            <div class="barcode-area">
                                <svg id="${barcodeId}"></svg>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="modal-footer">
                <button class="cmd-btn" id="downloadIdBtn">Download Print-Ready ID</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    modal.querySelector('.id-card-close')?.addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (event) => {
        if (event.target === modal) modal.remove();
    });

    const downloadButton = modal.querySelector('#downloadIdBtn');
    if (downloadButton) {
        downloadButton.disabled = true;
        downloadButton.textContent = 'Preparing ID Card...';
    }

    try {
        await ensureIdCardFormatLibraries();

        const qrImage = modal.querySelector('.qr-code');
        if (qrImage) qrImage.src = await makeQrDataUrl(verificationUrl(data.serviceNumber));

        window.JsBarcode(`#${barcodeId}`, data.uniqueID, {
            format: "CODE128",
            width: 1.5,
            height: 31,
            displayValue: true,
            fontSize: 8,
            lineColor: "#064d19"
        });

        if (downloadButton) {
            downloadButton.disabled = false;
            downloadButton.textContent = 'Download Print-Ready ID';
            downloadButton.onclick = async () => {
                const frontSide = document.getElementById('frontSide');
                const backSide = document.getElementById('backSide');
                if (!frontSide || !backSide) {
                    alert('ID card preview is not ready yet.');
                    return;
                }

                downloadButton.disabled = true;
                downloadButton.textContent = 'Downloading...';

                try {
                    await document.fonts?.ready;
                    const exportOptions = {
                        quality: 1,
                        pixelRatio: 3,
                        cacheBust: true,
                        imagePlaceholder: LOGO_IMAGE
                    };
                    const front = await window.htmlToImage.toPng(frontSide, exportOptions);
                    const back = await window.htmlToImage.toPng(backSide, exportOptions);

                    downloadDataUrl(front, `ID_Front_${safeFilePart(data.serviceNumber)}.png`);
                    setTimeout(() => {
                        downloadDataUrl(back, `ID_Back_${safeFilePart(data.serviceNumber)}.png`);
                    }, 250);
                } catch (error) {
                    console.error('ID card download failed:', error);
                    alert(error.message || 'Unable to download this ID card. Please try again.');
                } finally {
                    downloadButton.disabled = false;
                    downloadButton.textContent = 'Download Print-Ready ID';
                }
            };
        }
    } catch (error) {
        console.error('ID card asset setup failed:', error);
        if (downloadButton) {
            downloadButton.disabled = true;
            downloadButton.textContent = 'Download unavailable';
            downloadButton.title = error.message || 'Unable to load ID card export tools.';
        }
    }
}
