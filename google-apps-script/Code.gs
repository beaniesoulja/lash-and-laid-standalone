const CONFIG = Object.freeze({
  spreadsheetId: '1tc2kUS5NtLJeCcpRq_wC-d_W9BFIZhK_DGm0nU4jGoU',
  sheetName: 'Bookings',
  notifyEmail: 'Lashandlaid@gmail.com'
});

function doGet() {
  return json_({ ok: true, service: 'Lash & Laid booking receiver' });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const expectedSecret = PropertiesService.getScriptProperties().getProperty('BOOKING_WEBHOOK_SECRET');
    const payload = JSON.parse((e && e.postData && e.postData.contents) || '{}');

    if (!expectedSecret || !safeEqual_(String(payload.secret || ''), expectedSecret)) {
      return json_({ ok: false, error: 'Unauthorized' });
    }

    const reference = clean_(payload.bookingReference, 40);
    const fullName = clean_(payload.fullName, 120);
    const whatsapp = clean_(payload.whatsapp, 50);
    const email = clean_(payload.email, 160);
    const service = clean_(payload.service, 120);
    const requestedDate = clean_(payload.requestedDate, 20);
    const recordId = clean_(payload.recordId, 80);
    const source = clean_(payload.source, 30) || 'Website';
    const campaignSource = safeSheetText_(payload.campaignSource, 120);
    const campaignMedium = safeSheetText_(payload.campaignMedium, 120);
    const campaignName = safeSheetText_(payload.campaignName, 120);
    const campaignContent = safeSheetText_(payload.campaignContent, 120);
    const campaignTerm = safeSheetText_(payload.campaignTerm, 120);
    const photos = Array.isArray(payload.photos) ? payload.photos.slice(0, 3).map(function (value) {
      return clean_(value, 1000);
    }) : [];

    if (!reference || !fullName || !whatsapp || !service || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return json_({ ok: false, error: 'Missing or invalid booking fields' });
    }

    const sheet = SpreadsheetApp.openById(CONFIG.spreadsheetId).getSheetByName(CONFIG.sheetName);
    if (!sheet) throw new Error('Bookings sheet was not found');
    if (sheet.getMaxColumns() < 19) sheet.insertColumnsAfter(sheet.getMaxColumns(), 19 - sheet.getMaxColumns());
    const campaignHeaders = sheet.getRange('O5:S5');
    if (campaignHeaders.getValues()[0].every(function (value) { return !value; })) {
      campaignHeaders.setValues([['UTM source', 'UTM medium', 'UTM campaign', 'UTM content', 'UTM term']]);
    }

    const duplicate = sheet.getRange('A6:A').createTextFinder(reference).matchEntireCell(true).findNext();
    if (duplicate) return json_({ ok: true, duplicate: true, bookingReference: reference });

    const submittedAt = payload.submittedAt ? new Date(payload.submittedAt) : new Date();
    const requestedAt = new Date(requestedDate + 'T12:00:00');
    sheet.appendRow([
      reference,
      submittedAt,
      fullName,
      whatsapp,
      email,
      service,
      requestedAt,
      photos[0] || '',
      photos[1] || '',
      photos[2] || '',
      'New',
      '',
      source,
      recordId,
      campaignSource,
      campaignMedium,
      campaignName,
      campaignContent,
      campaignTerm
    ].map(function (cell) {
      // Every string crosses the spreadsheet boundary as data, never a formula.
      return typeof cell === 'string' ? safeSheetText_(cell, cell.length) : cell;
    }));

    const emailContent = buildBookingEmail_({
      reference: reference,
      fullName: fullName,
      whatsapp: whatsapp,
      email: email,
      service: service,
      requestedDate: requestedDate,
      submittedAt: submittedAt,
      photos: photos,
      source: source
    });

    MailApp.sendEmail({
      to: CONFIG.notifyEmail,
      subject: 'New Lash & Laid booking request — ' + reference,
      body: emailContent.plainText,
      htmlBody: emailContent.html,
      name: 'Lash & Laid Bookings'
    });

    if (isValidEmail_(email)) {
      const customerEmail = buildCustomerEmail_({
        reference: reference,
        fullName: fullName,
        service: service,
        requestedDate: requestedDate
      });
      MailApp.sendEmail({
        to: email,
        replyTo: CONFIG.notifyEmail,
        subject: 'We received your Lash & Laid booking request — ' + reference,
        body: customerEmail.plainText,
        htmlBody: customerEmail.html,
        name: 'Lash & Laid'
      });
    }

    return json_({ ok: true, bookingReference: reference });
  } catch (error) {
    console.error(error);
    return json_({ ok: false, error: 'Booking receiver error' });
  } finally {
    try { lock.releaseLock(); } catch (_) {}
  }
}

function buildBookingEmail_(booking) {
  const trackerUrl = 'https://docs.google.com/spreadsheets/d/' + CONFIG.spreadsheetId + '/edit';
  const whatsappUrl = 'https://wa.me/' + booking.whatsapp.replace(/\D/g, '') + '?text=' +
    encodeURIComponent('Hello ' + booking.fullName + ', we are following up on your Lash & Laid booking request ' + booking.reference + '.');
  const date = formatDate_(booking.requestedDate);
  const submitted = Utilities.formatDate(new Date(booking.submittedAt), Session.getScriptTimeZone() || 'Africa/Cairo', 'd MMM yyyy, h:mm a');
  const photos = (booking.photos || []).map(function (url, index) {
    return '<p style="margin:8px 0;">' + emailLink_(url, 'View inspiration photo ' + (index + 1)) + '</p>';
  }).join('');
  const content = emailIntro_('STAFF NOTIFICATION', 'A new appointment request.',
    'Review the details below, then contact the client to agree on their appointment.') +
    emailSummary_('REQUEST DETAILS', [
      ['Reference', booking.reference], ['Service', booking.service], ['Preferred date', date]
    ]) +
    emailSection_('Client details', '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">' +
      detailRow_('Name', booking.fullName) + detailRow_('WhatsApp', booking.whatsapp) +
      detailRow_('Email', booking.email || 'Not provided') + '</table>') +
    emailSection_('Next action', '<p style="margin:0 0 22px;">Check availability and contact the client. Confirm the final date and time together before marking this request as confirmed.</p>' +
      emailButton_(whatsappUrl, 'Contact client on WhatsApp') +
      '<p style="margin:20px 0 0;">' + emailLink_(trackerUrl, 'View booking tracker') + '</p>') +
    (photos ? emailSection_('Inspiration photos', photos) : '') +
    '<tr><td class="email-pad" style="padding:0 40px 32px;font:12px/20px Arial,sans-serif;color:#776b72;">Received ' +
      escapeHtml_(submitted) + ' &middot; ' + escapeHtml_(booking.source) + '</td></tr>';
  return {
    html: emailShell_('New booking request ' + booking.reference, content, 'Private booking information &middot; For Lash &amp; Laid staff only.'),
    plainText: ['NEW LASH & LAID BOOKING REQUEST', 'Reference: ' + booking.reference,
      'Name: ' + booking.fullName, 'Service: ' + booking.service, 'Preferred date: ' + date,
      'WhatsApp: ' + booking.whatsapp, 'Email: ' + (booking.email || 'Not provided'),
      'Received: ' + submitted, 'Source: ' + booking.source,
      'Contact the client to agree on the final date and time.',
      'WhatsApp: ' + whatsappUrl, 'Booking tracker: ' + trackerUrl].concat(booking.photos || []).join('\n')
  };
}

function buildCustomerEmail_(booking) {
  const firstName = booking.fullName.trim().split(/\s+/)[0];
  const date = formatDate_(booking.requestedDate);
  const whatsappUrl = 'https://wa.me/201092445224?text=' +
    encodeURIComponent('Hello Lash & Laid, I am following up on booking request ' + booking.reference + '.');
  const content = emailIntro_('YOUR BOOKING REQUEST', 'Your next look starts here.',
    'Thank you, ' + firstName + ', for choosing Lash & Laid. We have received your appointment request and look forward to welcoming you.') +
    emailSummary_('YOUR APPOINTMENT REQUEST', [
      ['Service', booking.service], ['Preferred date', date], ['Reference', booking.reference]
    ]) +
    emailSection_('What happens next', '<p style="margin:0 0 14px;">Our team will review availability and contact you shortly on WhatsApp to agree on a date and time that works for you.</p>' +
      '<p style="margin:0;"><strong style="color:#450c2e;">Your appointment is awaiting confirmation.</strong> We will confirm your final schedule with you personally.</p>') +
    emailSection_('Have a question or a look in mind?', '<p style="margin:0 0 22px;">Send us a message or share your inspiration photos. Include your booking reference so we can find your request.</p>' +
      emailButton_(whatsappUrl, 'Chat with Lash & Laid')) +
    '<tr><td class="email-pad" style="padding:0 40px 36px;font:15px/25px Arial,sans-serif;color:#62535c;">With care,<br><strong style="color:#450c2e;">The Lash &amp; Laid team</strong></td></tr>';
  return {
    html: emailShell_('Thank you, ' + firstName + '. Your booking request ' + booking.reference + ' has been received.', content,
      'You received this email because you requested an appointment with Lash &amp; Laid.'),
    plainText: ['Hi ' + firstName + ',', '', 'Thank you for choosing Lash & Laid. We have received your booking request.',
      'Service: ' + booking.service, 'Preferred date: ' + date, 'Reference: ' + booking.reference, '',
      'Our team will contact you shortly on WhatsApp to agree on the final date and time. Your appointment is awaiting confirmation.',
      '', 'Questions or inspiration photos? Chat with us: ' + whatsappUrl, '', 'With care,', 'The Lash & Laid team'].join('\n')
  };
}

// Table-based layout and inline styles keep the reading order intact in email clients.
function emailShell_(preheader, content, footer) {
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="x-apple-disable-message-reformatting"><title>Lash &amp; Laid</title>' +
    '<style>body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}table{border-collapse:collapse}a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important}@media screen and (max-width:600px){.email-outer{padding:12px 8px!important}.email-pad{padding-left:24px!important;padding-right:24px!important}.email-title{font-size:32px!important;line-height:38px!important}.detail-label,.detail-value{display:block!important;width:auto!important}.detail-label{padding-bottom:3px!important;border-bottom:0!important}.detail-value{padding-top:0!important}.email-button{width:100%!important}}</style></head>' +
    '<body style="margin:0;padding:0;background-color:#eee9e5;">' +
    '<div style="display:none!important;visibility:hidden;mso-hide:all;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">' + escapeHtml_(preheader) + '</div>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#eee9e5"><tr><td class="email-outer" align="center" style="padding:32px 16px;">' +
    '<!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#fdfbf8" style="width:100%;max-width:600px;background-color:#fdfbf8;">' +
    '<tr><td height="5" bgcolor="#cbb1ed" style="height:5px;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    '<tr><td class="email-pad" align="center" bgcolor="#450c2e" style="padding:28px 40px;background-color:#450c2e;">' +
    '<a href="https://www.lashandlaid.com/" style="font:32px/40px Georgia,serif;color:#ffffff;text-decoration:none;">Lash &amp; Laid</a>' +
    '<p style="margin:7px 0 0;font:10px/16px Arial,sans-serif;letter-spacing:2px;color:#ddcbee;">A DIFFERENT STANDARD OF BEAUTY</p></td></tr>' +
    content +
    '<tr><td class="email-pad" style="padding:24px 40px;border-top:1px solid #e5dcdF;font:12px/20px Arial,sans-serif;color:#776b72;">' +
    '<p style="margin:0 0 8px;color:#450c2e;">Lash &amp; Laid &middot; New Cairo, Egypt</p>' +
    '<p style="margin:0 0 12px;">' + footer + '</p>' +
    emailLink_('https://www.lashandlaid.com/', 'Visit our website') +
    '</td></tr></table><!--[if mso]></td></tr></table><![endif]--></td></tr></table></body></html>';
}

function emailIntro_(eyebrow, title, copy) {
  return '<tr><td class="email-pad" style="padding:36px 40px 28px;">' +
    '<p style="margin:0 0 14px;font:11px/18px Arial,sans-serif;font-weight:bold;letter-spacing:1.6px;color:#79616f;">' + escapeHtml_(eyebrow) + '</p>' +
    '<h1 class="email-title" style="margin:0 0 18px;font:38px/44px Georgia,serif;font-weight:normal;color:#450c2e;">' + escapeHtml_(title) + '</h1>' +
    '<p style="margin:0;font:15px/25px Arial,sans-serif;color:#62535c;">' + escapeHtml_(copy) + '</p></td></tr>';
}

function emailSummary_(heading, fields) {
  return '<tr><td class="email-pad" style="padding:0 40px 30px;">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f1eaf5" style="background-color:#f1eaf5;"><tr><td style="padding:22px 24px;">' +
    '<p style="margin:0 0 12px;font:11px/18px Arial,sans-serif;letter-spacing:1.3px;font-weight:bold;color:#450c2e;">' + escapeHtml_(heading) + '</p>' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed;">' +
    fields.map(function (field) { return detailRow_(field[0], field[1]); }).join('') +
    '</table></td></tr></table></td></tr>';
}

function emailSection_(title, content) {
  return '<tr><td class="email-pad" style="padding:0 40px 30px;font:15px/25px Arial,sans-serif;color:#62535c;">' +
    '<h2 style="margin:0 0 12px;font:18px/26px Arial,sans-serif;font-weight:bold;color:#450c2e;">' + escapeHtml_(title) + '</h2>' + content + '</td></tr>';
}

function emailButton_(url, label) {
  return '<table class="email-button" role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#450c2e" style="background-color:#450c2e;border-radius:4px;mso-padding-alt:15px 24px;">' +
    '<a href="' + escapeHtml_(url) + '" style="display:block;padding:15px 24px;border:1px solid #450c2e;border-radius:4px;font:14px/20px Arial,sans-serif;font-weight:bold;color:#ffffff;text-align:center;text-decoration:none;mso-padding-alt:0;">' + escapeHtml_(label) + '</a></td></tr></table>';
}

function emailLink_(url, label) {
  return '<a href="' + escapeHtml_(url) + '" style="color:#450c2e;text-decoration:underline;text-underline-offset:3px;font-family:Arial,sans-serif;">' + escapeHtml_(label) + '</a>';
}

function detailRow_(label, value) {
  return '<tr><td class="detail-label" width="34%" valign="top" style="padding:10px 12px 10px 0;border-bottom:1px solid #dfd6e2;font:13px/21px Arial,sans-serif;color:#776b72;">' + escapeHtml_(label) +
    '</td><td class="detail-value" valign="top" style="padding:10px 0;border-bottom:1px solid #dfd6e2;font:14px/21px Arial,sans-serif;font-weight:bold;color:#450c2e;overflow-wrap:anywhere;word-break:break-word;">' + escapeHtml_(value) + '</td></tr>';
}

function formatDate_(value) {
  const date = new Date(value + 'T12:00:00');
  if (isNaN(date.getTime())) return value;
  return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Africa/Cairo', 'EEEE, d MMMM yyyy');
}

function escapeHtml_(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ''));
}

function clean_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

function safeSheetText_(value, maxLength) {
  const text = clean_(value, maxLength);
  const start = text.replace(/^[\s\u0000-\u001f\u007f\u200b-\u200f\ufeff]+/, '');
  return /^[=+\-@]/.test(start) ? "'" + text : text;
}

function safeEqual_(left, right) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
