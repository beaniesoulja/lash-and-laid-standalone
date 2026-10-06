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
    const photos = Array.isArray(payload.photos) ? payload.photos.slice(0, 3).map(function (value) {
      return clean_(value, 1000);
    }) : [];

    if (!reference || !fullName || !whatsapp || !service || !/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
      return json_({ ok: false, error: 'Missing or invalid booking fields' });
    }

    const sheet = SpreadsheetApp.openById(CONFIG.spreadsheetId).getSheetByName(CONFIG.sheetName);
    if (!sheet) throw new Error('Bookings sheet was not found');

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
      recordId
    ]);

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
  const whatsappDigits = booking.whatsapp.replace(/\D/g, '');
  const whatsappText = encodeURIComponent('Hello ' + booking.fullName + ', we are following up on your Lash & Laid booking request ' + booking.reference + '.');
  const whatsappUrl = whatsappDigits ? 'https://wa.me/' + whatsappDigits + '?text=' + whatsappText : trackerUrl;
  const requestedDateLabel = formatDate_(booking.requestedDate);
  const submittedLabel = Utilities.formatDate(new Date(booking.submittedAt), Session.getScriptTimeZone() || 'Africa/Cairo', 'd MMM yyyy, h:mm a');
  const photoRows = booking.photos.length ? booking.photos.map(function (url, index) {
    return '<a href="' + escapeHtml_(url) + '" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border:1px solid #cbb1ed;border-radius:999px;color:#450c2e;font-family:Arial,sans-serif;font-size:13px;font-weight:700;text-decoration:none;">View photo ' + (index + 1) + '</a>';
  }).join('') : '<span style="color:#74616d;">No photos attached</span>';

  const rows = [
    detailRow_('Full name', booking.fullName),
    detailRow_('Service', booking.service),
    detailRow_('Preferred date', requestedDateLabel),
    detailRow_('WhatsApp', booking.whatsapp),
    detailRow_('Email', booking.email || 'Not provided'),
    detailRow_('Submitted', submittedLabel),
    detailRow_('Source', booking.source)
  ].join('');

  const html = '<!doctype html>' +
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f3eef2;word-spacing:normal;">' +
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">New booking request ' + escapeHtml_(booking.reference) + ' from ' + escapeHtml_(booking.fullName) + '.</div>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3eef2;">' +
        '<tr><td align="center" style="padding:28px 12px;">' +
          '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 10px 34px rgba(69,12,46,.10);">' +
            '<tr><td style="padding:36px 38px 30px;background:#450c2e;color:#ffffff;">' +
              '<div style="font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#cbb1ed;">Lash &amp; Laid</div>' +
              '<h1 style="margin:14px 0 8px;font-family:Georgia,serif;font-size:36px;line-height:1.08;font-weight:400;color:#ffffff;">New booking request</h1>' +
              '<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.6;color:#eadfe6;">A client has requested an appointment. Review the details and confirm the final date and time with them manually.</p>' +
            '</td></tr>' +
            '<tr><td style="padding:28px 38px 8px;background:#ffffff;">' +
              '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>' +
                '<td style="padding:18px 20px;background:#f9f6f2;border:1px solid #eadfe6;border-radius:14px;">' +
                  '<div style="font-family:Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#7d5d70;">Booking reference</div>' +
                  '<div style="margin-top:7px;font-family:Georgia,serif;font-size:28px;line-height:1.1;color:#450c2e;">' + escapeHtml_(booking.reference) + '</div>' +
                '</td>' +
              '</tr></table>' +
            '</td></tr>' +
            '<tr><td style="padding:20px 38px 8px;">' +
              '<h2 style="margin:0 0 10px;font-family:Georgia,serif;font-size:23px;font-weight:400;color:#450c2e;">Client details</h2>' +
              '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">' + rows + '</table>' +
            '</td></tr>' +
            '<tr><td style="padding:24px 38px 8px;">' +
              '<a href="' + escapeHtml_(whatsappUrl) + '" style="display:inline-block;padding:15px 24px;border-radius:999px;background:#25d366;color:#103c20;font-family:Arial,sans-serif;font-size:14px;font-weight:800;text-decoration:none;">Open WhatsApp chat</a>' +
              '<a href="' + escapeHtml_(trackerUrl) + '" style="display:inline-block;margin-left:8px;padding:14px 22px;border:1px solid #450c2e;border-radius:999px;color:#450c2e;font-family:Arial,sans-serif;font-size:14px;font-weight:800;text-decoration:none;">Open booking tracker</a>' +
            '</td></tr>' +
            '<tr><td style="padding:26px 38px 8px;">' +
              '<h2 style="margin:0 0 12px;font-family:Georgia,serif;font-size:21px;font-weight:400;color:#450c2e;">Inspiration photos</h2>' + photoRows +
            '</td></tr>' +
            '<tr><td style="padding:28px 38px 34px;">' +
              '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:16px 18px;background:#f2eafa;border-left:4px solid #cbb1ed;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.6;color:#543448;">This is a booking request, not a confirmed appointment. Contact the client to agree on the final date and time before confirming.</td></tr></table>' +
            '</td></tr>' +
            '<tr><td style="padding:22px 38px;background:#f9f6f2;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#806f79;">Private client information for Lash &amp; Laid staff only. Please do not forward this email outside the business.</td></tr>' +
          '</table>' +
        '</td></tr>' +
      '</table>' +
    '</body></html>';

  const plainText = [
    'NEW LASH & LAID BOOKING REQUEST',
    '',
    'Reference: ' + booking.reference,
    'Name: ' + booking.fullName,
    'Service: ' + booking.service,
    'Preferred date: ' + requestedDateLabel,
    'WhatsApp: ' + booking.whatsapp,
    'Email: ' + (booking.email || 'Not provided'),
    'Submitted: ' + submittedLabel,
    'Source: ' + booking.source,
    '',
    'This is a request, not a confirmed appointment. Contact the client to agree on the final date and time.',
    '',
    'Open WhatsApp: ' + whatsappUrl,
    'Open booking tracker: ' + trackerUrl
  ].join('\n');

  return { html: html, plainText: plainText };
}

function buildCustomerEmail_(booking) {
  const requestedDateLabel = formatDate_(booking.requestedDate);
  const firstName = booking.fullName.split(/\s+/)[0] || booking.fullName;
  const whatsappText = encodeURIComponent('Hello Lash & Laid, I am following up on booking request ' + booking.reference + '.');
  const whatsappUrl = 'https://wa.me/201092445224?text=' + whatsappText;

  const html = '<!doctype html>' +
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f3eef2;word-spacing:normal;">' +
      '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Thank you, ' + escapeHtml_(firstName) + '. Your Lash &amp; Laid booking request has been received.</div>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background:#f3eef2;">' +
        '<tr><td align="center" style="padding:28px 12px;">' +
          '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:640px;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 10px 34px rgba(69,12,46,.10);">' +
            '<tr><td style="padding:38px 38px 32px;background:#450c2e;color:#ffffff;text-align:center;">' +
              '<div style="font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:3px;text-transform:uppercase;color:#cbb1ed;">Lash &amp; Laid</div>' +
              '<h1 style="margin:16px 0 10px;font-family:Georgia,serif;font-size:38px;line-height:1.08;font-weight:400;color:#ffffff;">Thank you, ' + escapeHtml_(firstName) + '.</h1>' +
              '<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;line-height:1.65;color:#eadfe6;">Your booking request has been saved. Our team will review it and contact you shortly to confirm the date and agree on a suitable time.</p>' +
            '</td></tr>' +
            '<tr><td style="padding:30px 38px 10px;">' +
              '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>' +
                '<td style="padding:19px 20px;background:#f9f6f2;border:1px solid #eadfe6;border-radius:14px;text-align:center;">' +
                  '<div style="font-family:Arial,sans-serif;font-size:11px;font-weight:800;letter-spacing:1.8px;text-transform:uppercase;color:#7d5d70;">Your booking reference</div>' +
                  '<div style="margin-top:8px;font-family:Georgia,serif;font-size:30px;line-height:1.1;color:#450c2e;">' + escapeHtml_(booking.reference) + '</div>' +
                '</td>' +
              '</tr></table>' +
            '</td></tr>' +
            '<tr><td style="padding:22px 38px 8px;">' +
              '<h2 style="margin:0 0 10px;font-family:Georgia,serif;font-size:23px;font-weight:400;color:#450c2e;">Your request</h2>' +
              '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-collapse:collapse;">' +
                detailRow_('Service', booking.service) +
                detailRow_('Preferred date', requestedDateLabel) +
              '</table>' +
            '</td></tr>' +
            '<tr><td style="padding:25px 38px 12px;text-align:center;">' +
              '<a href="' + escapeHtml_(whatsappUrl) + '" style="display:inline-block;padding:15px 25px;border-radius:999px;background:#25d366;color:#103c20;font-family:Arial,sans-serif;font-size:14px;font-weight:800;text-decoration:none;">Contact us on WhatsApp</a>' +
            '</td></tr>' +
            '<tr><td style="padding:22px 38px 34px;">' +
              '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:17px 18px;background:#f2eafa;border-left:4px solid #cbb1ed;border-radius:8px;font-family:Arial,sans-serif;font-size:13px;line-height:1.65;color:#543448;"><strong>What happens next?</strong><br>We will contact you to confirm availability and agree on the appointment time. Your preferred date is not confirmed until you receive that follow-up from us.</td></tr></table>' +
            '</td></tr>' +
            '<tr><td style="padding:23px 38px;background:#f9f6f2;text-align:center;font-family:Arial,sans-serif;font-size:11px;line-height:1.6;color:#806f79;">Keep your booking reference for future communication.<br>We look forward to creating your next Lash &amp; Laid look.</td></tr>' +
          '</table>' +
        '</td></tr>' +
      '</table>' +
    '</body></html>';

  const plainText = [
    'THANK YOU FOR CHOOSING LASH & LAID',
    '',
    'Hi ' + firstName + ',',
    '',
    'Your booking request has been saved. Our team will review it and contact you shortly to confirm the date and agree on a suitable time.',
    '',
    'Booking reference: ' + booking.reference,
    'Service: ' + booking.service,
    'Preferred date: ' + requestedDateLabel,
    '',
    'Please note: your preferred date is not confirmed until you receive our follow-up.',
    '',
    'Contact us on WhatsApp: ' + whatsappUrl,
    '',
    'We look forward to creating your next Lash & Laid look.'
  ].join('\n');

  return { html: html, plainText: plainText };
}

function detailRow_(label, value) {
  return '<tr>' +
    '<td width="38%" valign="top" style="padding:12px 10px 12px 0;border-bottom:1px solid #eee5ea;font-family:Arial,sans-serif;font-size:12px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;color:#806f79;">' + escapeHtml_(label) + '</td>' +
    '<td valign="top" style="padding:12px 0;border-bottom:1px solid #eee5ea;font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#450c2e;">' + escapeHtml_(value) + '</td>' +
  '</tr>';
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
