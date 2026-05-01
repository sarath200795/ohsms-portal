const env = typeof import.meta !== 'undefined' ? import.meta.env : {};

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

const getConfiguredValue = (key) => String(env[key] || '').trim();

const getVendorCredentialEmailConfig = () => ({
    publicKey: getConfiguredValue('VITE_EMAILJS_PUBLIC_KEY'),
    serviceId: getConfiguredValue('VITE_EMAILJS_SERVICE_ID'),
    templateId: getConfiguredValue('VITE_EMAILJS_TEMPLATE_ID_VENDOR_CREDENTIALS')
});

export const isVendorCredentialEmailConfigured = () => {
    const config = getVendorCredentialEmailConfig();
    return Boolean(config.publicKey && config.serviceId && config.templateId);
};

export const buildVendorCredentialEmailCopy = ({
    companyName = '',
    portalUrl = '',
    temporaryPassword = '',
    toEmail = '',
    toName = '',
    vendorCode = '',
    siteName = ''
}) => {
    const greetingName = toName || companyName || 'Vendor User';
    const lines = [
        `Hello ${greetingName},`,
        '',
        `Your contractor portal access has been created for ${companyName || 'your company'}.`,
        '',
        'Use the credentials below for your first login:',
        `Portal URL: ${portalUrl}`,
        toEmail ? `Portal Email: ${toEmail}` : '',
        `Temporary Password: ${temporaryPassword}`,
        vendorCode ? `Vendor Reference Code: ${vendorCode}` : '',
        siteName ? `Assigned Site: ${siteName}` : '',
        '',
        'Important:',
        '1. Sign in once with this temporary password.',
        '2. The portal will force you to change the password immediately.',
        '3. After changing it, sign in again with your new password.',
        '',
        'If you did not expect this email, please contact your client administrator.',
        '',
        'Regards,',
        'WE OHSMS Contractor Portal'
    ].filter(Boolean);

    return lines.join('\n');
};

export const buildVendorCredentialMailto = ({
    toEmail = '',
    companyName = '',
    portalUrl = '',
    temporaryPassword = '',
    toName = '',
    vendorCode = '',
    siteName = ''
}) => {
    const subject = `Vendor Portal Temporary Password - ${companyName || 'WE OHSMS'}`;
    const body = buildVendorCredentialEmailCopy({
        companyName,
        portalUrl,
        temporaryPassword,
        toEmail,
        toName,
        vendorCode,
        siteName
    });

    return `mailto:${toEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
};

export const sendVendorCredentialEmail = async ({
    toEmail = '',
    companyName = '',
    portalUrl = '',
    temporaryPassword = '',
    toName = '',
    vendorCode = '',
    siteName = '',
    issuedBy = ''
}) => {
    const config = getVendorCredentialEmailConfig();
    if (!config.publicKey || !config.serviceId || !config.templateId) {
        throw new Error('Vendor credential email delivery is not configured. Add the EmailJS values in the environment before sending temporary passwords by mail.');
    }

    const response = await fetch(EMAILJS_ENDPOINT, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            service_id: config.serviceId,
            template_id: config.templateId,
            user_id: config.publicKey,
            template_params: {
                to_email: toEmail,
                to_name: toName || companyName || 'Vendor User',
                company_name: companyName,
                portal_url: portalUrl,
                temporary_password: temporaryPassword,
                vendor_code: vendorCode,
                assigned_site: siteName,
                issued_by: issuedBy,
                login_instructions: 'Use this temporary password for the first sign-in. The portal will force an immediate password change before access continues.'
            }
        })
    });

    if (!response.ok) {
        const responseText = await response.text().catch(() => '');
        throw new Error(`Vendor credential email failed (${response.status})${responseText ? `: ${responseText}` : ''}`);
    }

    return {
        sentAt: new Date().toISOString()
    };
};
