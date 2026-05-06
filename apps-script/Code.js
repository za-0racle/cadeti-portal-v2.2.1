// CADETI portal Apps Script backend.
// Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, and FIREBASE_PRIVATE_KEY in
// Apps Script Project Settings > Script Properties before deploying.

const PASSPORT_FOLDER_ID = "1a-Acni2NgvLDmPHhaI8Lvyu01_4PLoiH";
const PDF_FOLDER_ID = "1yuVAlA9TElI0ZLjy_fXxBxbQQx4uw1Jj";
const GALLERY_ROOT_FOLDER_ID = "1XJ7PLo81YNAc5uEhi3glmCIf2crrU30G";
const MEDIA_FOLDER_ID = "1lyPK9ZkvDjArkXay10lW_kxirQ0jgYlA";
const RECRUIT_TEMPLATE_ID = "1FkE85qkCA_d_osPW_-YobYnBUiUxtWyVb4jD_urc4BM";
const OFFICER_TEMPLATE_ID = "1du8wnw9Xf-OQzlAmmuLyKt-U_Owv_cR-yk7LsM19x2g";
const INTAKE_YEAR = "2026";
const HQ_EMAIL = "cadetinitiative1@gmail.com";

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const params = e && e.parameter ? e.parameter : {};
    const action = params.action;

    if (action === "getLocations") {
      return jsonResponse(sheetRowsToObjects(ss.getSheetByName("Locations")));
    }

    if (action === "searchRecruit") {
      requireParams(params, ["id"]);
      const result = findRecordByHeader(ss.getSheetByName("Recruits"), "Unique ID", params.id);
      return result ? jsonResponse({ status: "success", data: result.record }) : errorResponse("Recruit ID not found.");
    }

    if (action === "searchByServiceNumber") {
      requireParams(params, ["serviceNumber"]);
      const result = findRecordByHeader(ss.getSheetByName("Sheet1"), "Service Number", params.serviceNumber);
      return result ? jsonResponse({ status: "success", data: result.record }) : errorResponse("Service Number not found.");
    }

    if (action === "getActivities") {
      return jsonResponse(sheetRowsToObjects(ss.getSheetByName("Activities")));
    }

    if (action === "getGallery") {
      return jsonResponse(getGalleryData());
    }

    if (action === "transferOfficer") {
      requireParams(params, ["serviceNumber", "newState", "newArea"]);
      return transferOfficer(params.serviceNumber, params.newState, params.newArea);
    }

    if (action === "getAdminData") {
      return jsonResponse(
        getSheetData(ss, "Sheet1", "Officer").concat(getSheetData(ss, "Recruits", "Recruit"))
      );
    }

    if (action === "sendResetInstructions") {
      requireParams(params, ["email", "name", "serviceNo", "tempPass"]);
      return sendResetEmail(params.email, params.name, params.serviceNo, params.tempPass);
    }

    return errorResponse("Unknown action.");
  } catch (error) {
    return errorResponse(error.message || error.toString());
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) throw new Error("Missing POST body.");
    const data = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.action === "uploadMedia") {
      requireObjectFields(data, ["base64", "mimeType"]);
      const blob = Utilities.newBlob(Utilities.base64Decode(data.base64), data.mimeType, data.fileName || ("Media_" + Date.now()));
      const file = DriveApp.getFolderById(MEDIA_FOLDER_ID).createFile(blob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      return jsonResponse({ status: "success", url: "https://lh3.googleusercontent.com/d/" + file.getId() });
    }

    if (data.action === "sendInquiry") {
      requireObjectFields(data, ["name", "email", "subject", "message"]);
      const sheet = getRequiredSheet(ss, "Inquiries");
      sheet.appendRow([new Date(), data.name, data.email, data.subject, data.message]);
      MailApp.sendEmail({
        to: HQ_EMAIL,
        subject: "WEB INQUIRY: " + data.subject,
        body: `From: ${data.name}\nEmail: ${data.email}\n\nMessage: ${data.message}`
      });
      return jsonResponse({ status: "success" });
    }

    if (data.action === "updateOfficerProfile") {
      return updateOfficerProfile(data);
    }

    if (data.action === "deleteOfficerRecord") {
      return deleteOfficerRecord(data);
    }

    return registerMember(data);
  } catch (error) {
    return errorResponse(error.message || error.toString());
  }
}

function registerMember(data) {
  requireObjectFields(data, ["regType", "firstName", "surname", "email"]);
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const mainSheet = getRequiredSheet(ss, "Sheet1");
  const recruitSheet = getRequiredSheet(ss, "Recruits");
  let targetSheet = mainSheet;
  let templateId = OFFICER_TEMPLATE_ID;
  let uniqueID = data.uniqueID || "";
  let serviceNumber = data.serviceNumber || "";

  if (data.regType === "Recruit") {
    requireObjectFields(data, ["stateCode", "areaCode"]);
    targetSheet = recruitSheet;
    templateId = RECRUIT_TEMPLATE_ID;
    uniqueID = `REC/${data.stateCode}/${data.areaCode}/${INTAKE_YEAR}/${("000" + recruitSheet.getLastRow()).slice(-3)}`;
    serviceNumber = "Pending";
  } else {
    requireObjectFields(data, ["uniqueID", "serviceNumber", "rank", "state", "area"]);
  }

  let recruit = null;
  if (data.regType === "Validation") {
    recruit = findRecordByHeader(recruitSheet, "Unique ID", data.originalID || "");
    if (!recruit) throw new Error("Recruit ID not found.");

    const registrationStatus = String(
      recruit.record["Registration Type"] ||
      recruit.record["Member Category"] ||
      recruit.record["Status"] ||
      ""
    ).trim().toLowerCase();

    if (registrationStatus === "converted" || registrationStatus === "validated") {
      throw new Error("You have already been verified. Go and check your mail.");
    }
  }

  let passportUrl = "N/A";
  let imageBlob = null;
  if (data.passportData) {
    imageBlob = Utilities.newBlob(
      Utilities.base64Decode(data.passportData),
      MimeType.JPEG,
      `Passport_${uniqueID.replace(/\//g, "_")}.jpg`
    );
    const file = DriveApp.getFolderById(PASSPORT_FOLDER_ID).createFile(imageBlob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    passportUrl = file.getUrl();
  }

  const pdfUrl = createOfficialPDF(data, uniqueID, serviceNumber, imageBlob, templateId);

  if (data.regType === "Validation") {
    if (recruit) setByHeader(recruitSheet, recruit.rowNumber, "Registration Type", "Converted");
  }

  targetSheet.appendRow([
    new Date(),
    data.firstName,
    data.surname,
    data.otherName || "",
    data.address || "",
    data.occupation || "",
    data.gender || "",
    data.phone || "",
    data.email,
    serviceNumber,
    data.rank || "",
    data.department || "",
    data.postHeld || "",
    data.state || "",
    data.area || "",
    data.intakeYear || INTAKE_YEAR,
    data.serialNumber || "Pending",
    data.areaOC || "Pending",
    data.nokName || "",
    data.nokRelation || "",
    data.nokPhone || "",
    data.nokAddress || "",
    uniqueID,
    passportUrl,
    pdfUrl,
    data.regType
  ]);

  sendGreenEmail(data, uniqueID, serviceNumber, pdfUrl);
  return jsonResponse({ status: "success", uniqueID, pdfUrl });
}

function transferOfficer(serviceNumber, newState, newArea) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getRequiredSheet(ss, "Sheet1");
  const result = findRecordByHeader(sheet, "Service Number", serviceNumber);
  if (!result) return errorResponse("Officer not found.");

  setByHeader(sheet, result.rowNumber, "State Command", newState);
  setByHeader(sheet, result.rowNumber, "Area Command", newArea);
  SpreadsheetApp.flush();

  const record = getRecordAtRow(sheet, result.rowNumber);
  let imageBlob = null;
  try {
    const pIdMatch = String(record["Passport URL"] || "").match(/[-\w]{25,}/);
    if (pIdMatch) imageBlob = DriveApp.getFileById(pIdMatch[0]).getBlob();
  } catch (error) {
    console.warn("Passport fetch failed during transfer: " + error);
  }

  const newPdfUrl = createOfficialPDF(record, record["Unique ID"], record["Service Number"], imageBlob, OFFICER_TEMPLATE_ID);
  setByHeader(sheet, result.rowNumber, "PDF URL", newPdfUrl);

  return jsonResponse({ status: "success", pdfUrl: newPdfUrl });
}

function updateOfficerProfile(data) {
  if (!data.uniqueID && !data.serviceNumber) throw new Error("Missing uniqueID or serviceNumber.");
  const sheet = getRequiredSheet(SpreadsheetApp.getActiveSpreadsheet(), "Sheet1");
  const result = data.uniqueID
    ? findRecordByHeader(sheet, "Unique ID", data.uniqueID)
    : findRecordByHeader(sheet, "Service Number", data.serviceNumber);

  if (!result) return errorResponse("Officer not found.");

  const updates = {
    "Rank": data.rank,
    "Department": data.department,
    "Post Held": data.postHeld,
    "State Command": data.state,
    "Area Command": data.area,
    "Phone Number": data.phone,
    "Email": data.email,
    "Residential Address": data.address,
    "NOK Full Name": data.nokName,
    "NOK Relationship": data.nokRelation,
    "NOK Phone Number": data.nokPhone,
    "Passport URL": data.passportUrl,
    "Signature URL": data.signatureUrl,
    "PDF URL": data.pdfUrl
  };

  Object.keys(updates).forEach((header) => {
    if (updates[header] !== undefined && updates[header] !== null && String(updates[header]).trim() !== "") {
      setByHeader(sheet, result.rowNumber, header, updates[header]);
    }
  });

  return jsonResponse({ status: "success", data: getRecordAtRow(sheet, result.rowNumber) });
}

function deleteOfficerRecord(data) {
  if (!data.uniqueID && !data.serviceNumber) throw new Error("Missing uniqueID or serviceNumber.");

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = [
    getRequiredSheet(ss, "Sheet1"),
    getRequiredSheet(ss, "Recruits")
  ];

  for (let i = 0; i < sheets.length; i++) {
    const sheet = sheets[i];
    let result = null;

    if (data.uniqueID) {
      try {
        result = findRecordByHeader(sheet, "Unique ID", data.uniqueID);
      } catch (error) {
        result = null;
      }
    }

    if (!result && data.serviceNumber) {
      try {
        result = findRecordByHeader(sheet, "Service Number", data.serviceNumber);
      } catch (error) {
        result = null;
      }
    }

    if (result) {
      if (data.state && result.record["State Command"] && result.record["State Command"] !== data.state) {
        throw new Error("State command mismatch. Record was not deleted.");
      }

      sheet.deleteRow(result.rowNumber);
      return jsonResponse({ status: "success" });
    }
  }

  throw new Error("Officer record not found.");
}

function getGalleryData() {
  const rootFolder = DriveApp.getFolderById(GALLERY_ROOT_FOLDER_ID);
  const subFolders = rootFolder.getFolders();
  const galleryData = [];
  while (subFolders.hasNext()) {
    const folder = subFolders.next();
    const catName = folder.getName();
    const files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next();
      if (file.getMimeType().indexOf("image") !== -1) {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        galleryData.push({
          id: file.getId(),
          category: catName.toLowerCase().replace(/\s+/g, "-"),
          displayCategory: catName,
          url: "https://lh3.googleusercontent.com/d/" + file.getId()
        });
      }
    }
  }
  return galleryData;
}

function getSheetData(ss, name, category) {
  const rows = sheetRowsToObjects(ss.getSheetByName(name));
  return rows.map((obj) => {
    obj["Member Category"] = category;
    if (obj["Timestamp"] instanceof Date) {
      obj["Timestamp"] = Utilities.formatDate(obj["Timestamp"], "GMT+1", "dd/MM/yyyy HH:mm");
    }
    return obj;
  });
}

function sheetRowsToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = normalizeHeaders(data.shift());
  return data.map((row) => rowToObject(headers, row));
}

function findRecordByHeader(sheet, headerName, value) {
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return null;
  const headers = normalizeHeaders(data[0]);
  const index = headers.indexOf(headerName);
  if (index === -1) throw new Error(`Missing sheet header: ${headerName}`);
  const needle = normalizeLookup(value);

  for (let i = 1; i < data.length; i++) {
    if (normalizeLookup(data[i][index]) === needle) {
      return { rowNumber: i + 1, record: rowToObject(headers, data[i]) };
    }
  }
  return null;
}

function getRecordAtRow(sheet, rowNumber) {
  const headers = normalizeHeaders(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
  const values = sheet.getRange(rowNumber, 1, 1, headers.length).getValues()[0];
  return rowToObject(headers, values);
}

function setByHeader(sheet, rowNumber, headerName, value) {
  const lastColumn = Math.max(sheet.getLastColumn(), 1);
  const headers = normalizeHeaders(sheet.getRange(1, 1, 1, lastColumn).getValues()[0]);
  let index = headers.indexOf(headerName);

  if (index === -1) {
    index = headers.length;
    sheet.getRange(1, index + 1).setValue(headerName);
  }

  sheet.getRange(rowNumber, index + 1).setValue(value);
}

function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((header, index) => {
    obj[header] = row[index];
  });
  return obj;
}

function normalizeHeaders(headers) {
  return headers.map((header) => String(header || "").trim());
}

function normalizeLookup(value) {
  return String(value || "").trim().toUpperCase();
}

function getRequiredSheet(ss, name) {
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error(`Missing sheet: ${name}`);
  return sheet;
}

function requireParams(params, names) {
  names.forEach((name) => {
    if (!String(params[name] || "").trim()) throw new Error(`Missing ${name}.`);
  });
}

function requireObjectFields(obj, names) {
  names.forEach((name) => {
    if (!String(obj[name] || "").trim()) throw new Error(`Missing ${name}.`);
  });
}

function sendGreenEmail(d, id, sn, url) {
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; background-color: #f9f9f9; padding: 40px 0;">
      <table width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width: 600px; margin: auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 15px rgba(0,0,0,0.1); border: 1px solid #eee;">
        <tr><td style="background-color: #004d00; padding: 30px; text-align: center;"><h1 style="color: #ffffff; margin: 0; font-size: 22px; text-transform: uppercase;">CADETI National Command</h1><p style="color: #4caf50; margin: 5px 0 0; font-size: 12px; font-weight: bold;">ENROLLMENT CONFIRMATION</p></td></tr>
        <tr><td style="padding: 40px; color: #333; line-height: 1.6;"><p>Attention Officer <b>${d.surname}, ${d.firstName}</b>,</p><p>Your record has been successfully updated in the National Registry.</p><div style="background-color: #f4fff4; border: 1px dashed #004d00; padding: 20px; margin: 20px 0;"><p style="margin:0; font-size:12px;"><b>Service No:</b> ${sn}</p><p style="margin:5px 0 0; font-size:12px;"><b>System ID:</b> ${id}</p></div><p style="text-align: center; margin-top: 30px;"><a href="${url}" style="background-color: #004d00; color: #fff; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold;">DOWNLOAD OFFICIAL FORM</a></p></td></tr>
      </table>
    </div>`;
  MailApp.sendEmail({ to: d.email, subject: `CADETI Success - ${id}`, htmlBody });
}

function sendResetEmail(targetEmail, name, serviceNo, tempPassword) {
  try {
    const shadowEmail = serviceNo.replace(/\//g, "").toLowerCase().trim() + "@cadeti.org";
    const authResult = changeFirebasePassword(shadowEmail, tempPassword);
    if (authResult !== true) throw new Error(authResult);

    const body = `<div style="font-family: sans-serif; padding: 30px; border: 1px solid #eee;">
      <h2 style="color: #004d00;">Access Restored</h2>
      <p>Officer ${name}, your recovery for ${serviceNo} is approved.</p>
      <div style="background:#f4fff4; padding:20px; text-align:center;"><b>TEMP PASSWORD:</b><h1>${tempPassword}</h1></div>
      <p style="color:red;">Please change this immediately in settings.</p>
    </div>`;
    MailApp.sendEmail({ to: targetEmail, subject: `RESTORED: Portal Access (${serviceNo})`, htmlBody: body });
    return jsonResponse({ status: "success" });
  } catch (error) {
    return errorResponse(error.message || error.toString());
  }
}

function changeFirebasePassword(email, newPassword) {
  try {
    const token = getServiceAccountToken();
    const lookup = JSON.parse(UrlFetchApp.fetch(`https://identitytoolkit.googleapis.com/v1/projects/${getFirebaseProjectId()}/accounts:lookup`, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify({ email: [email] }),
      muteHttpExceptions: true
    }).getContentText());
    if (!lookup.users) return "User Not Found";

    const update = UrlFetchApp.fetch(`https://identitytoolkit.googleapis.com/v1/projects/${getFirebaseProjectId()}/accounts:update`, {
      method: "post",
      contentType: "application/json",
      headers: { Authorization: "Bearer " + token },
      payload: JSON.stringify({ localId: lookup.users[0].localId, password: newPassword }),
      muteHttpExceptions: true
    });
    return update.getResponseCode() === 200 ? true : "Firebase Error";
  } catch (error) {
    return error.message || error.toString();
  }
}

function getServiceAccountToken() {
  const header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const claim = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: getFirebaseClientEmail(),
    scope: "https://www.googleapis.com/auth/identitytoolkit",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));
  const signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(header + "." + claim, getFirebasePrivateKey())
  );
  const jwt = header + "." + claim + "." + signature;
  const response = UrlFetchApp.fetch("https://oauth2.googleapis.com/token", {
    method: "post",
    payload: { grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: jwt }
  });
  return JSON.parse(response.getContentText()).access_token;
}

function createOfficialPDF(data, id, sn, blob, templateId) {
  const folder = DriveApp.getFolderById(PDF_FOLDER_ID);
  const copy = DriveApp.getFileById(templateId).makeCopy(`CADETI_${String(id).replace(/\//g, "_")}`, folder);
  const docId = copy.getId();
  const doc = DocumentApp.openById(docId);
  const body = doc.getBody();

  const fields = {
    uniqueID: id,
    serviceNumber: sn,
    firstName: data.firstName || data["First Name"],
    surname: data.surname || data["Surname"],
    otherName: data.otherName || data["Other Name"],
    address: data.address || data["Residential Address"],
    occupation: data.occupation || data["Occupation"],
    gender: data.gender || data["Gender"],
    phone: data.phone || data["Phone Number"],
    email: data.email || data["Email"],
    rank: data.rank || data["Rank"],
    department: data.department || data["Department"],
    postHeld: data.postHeld || data["Post Held"],
    state: data.state || data["State Command"],
    area: data.area || data["Area Command"],
    intakeYear: data.intakeYear || data["Intake Year"] || INTAKE_YEAR,
    serialNumber: data.serialNumber || data["Serial Number"],
    areaOC: data.areaOC || data["Area OC"],
    nokName: data.nokName || data["NOK Full Name"],
    nokRelation: data.nokRelation || data["NOK Relationship"],
    nokPhone: data.nokPhone || data["NOK Phone Number"],
    nokAddress: data.nokAddress || data["NOK Residential Address"]
  };

  Object.keys(fields).forEach((key) => body.replaceText(`{{${key}}}`, fields[key] || "Pending"));
  if (blob) {
    const position = body.findText("{{passport}}");
    if (position) {
      const element = position.getElement();
      const paragraph = element.getParent().asParagraph();
      element.removeFromParent();
      paragraph.appendInlineImage(blob).setWidth(100).setHeight(120);
    }
  }

  doc.saveAndClose();
  const pdf = folder.createFile(copy.getAs(MimeType.PDF));
  DriveApp.getFileById(docId).setTrashed(true);
  pdf.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return pdf.getUrl();
}

function getFirebaseProjectId() {
  return getScriptProperty("FIREBASE_PROJECT_ID");
}

function getFirebaseClientEmail() {
  return getScriptProperty("FIREBASE_CLIENT_EMAIL");
}

function getFirebasePrivateKey() {
  return getScriptProperty("FIREBASE_PRIVATE_KEY").replace(/\\n/g, "\n");
}

function getScriptProperty(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error(`Missing script property: ${name}`);
  return value;
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(message) {
  return jsonResponse({ status: "error", message });
}
