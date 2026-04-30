export function getAdminDisplayName(adminData = {}, authUser = null) {
    const directName = [
        adminData.name,
        adminData.fullName,
        adminData.displayName,
        adminData.adminName,
        adminData.username
    ].find((value) => String(value || '').trim());

    if (directName) return String(directName).trim();

    const composedName = [
        adminData.firstName || adminData.firstname || adminData.first_name || adminData.FirstName || adminData["First Name"],
        adminData.otherName || adminData.othername || adminData.other_name || adminData.OtherName || adminData["Other Name"],
        adminData.surname || adminData.lastName || adminData.lastname || adminData.last_name || adminData.Surname || adminData["Last Name"]
    ].filter((value) => String(value || '').trim()).join(' ').replace(/\s+/g, ' ').trim();

    return composedName || authUser?.displayName || adminData.email || authUser?.email || 'Administrator';
}

export function getAdminRole(adminData = {}) {
    return String(adminData.role || adminData.Role || adminData.adminRole || 'national').trim().toLowerCase();
}

export function getAdminAssignedState(adminData = {}) {
    return String(
        adminData.assignedState ||
        adminData.state ||
        adminData.State ||
        adminData.stateCommand ||
        adminData["State Command"] ||
        ''
    ).trim();
}
