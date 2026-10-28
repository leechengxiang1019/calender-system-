// Chronos — Email reminders: each pop-up reminder is also sent to the signed-in user's email (EmailJS)
'use strict';

/* ---------- fill these in from emailjs.com (see README, "电邮提醒") ---------- */
const EMAIL_CFG = { serviceId: '', templateId: '', publicKey: '' };
const NO_EMAIL = ['demo@chronos.app'];   // not a real inbox, never send to it

const emailReady = () => !!(window.emailjs && EMAIL_CFG.serviceId && EMAIL_CFG.templateId && EMAIL_CFG.publicKey);
if (emailReady()) emailjs.init({ publicKey: EMAIL_CFG.publicKey });

/* the email shows the same details as the pop-up, so priority still decides how much is included */
function sendReminderEmail(ev, mins) {
  if (!emailReady() || !state.user || NO_EMAIL.includes(state.user.email)) return;
  const to = state.user.email;
  emailjs.send(EMAIL_CFG.serviceId, EMAIL_CFG.templateId, {
    to_email: to,
    to_name: state.user.name,
    subject: t('mail.subj', ev.title),
    title: ev.title,
    priority: priName(ev.priority),
    when: mins > 0 ? t('r.in', fmtDur(mins)) : t('r.now'),
    details: reminderLines(ev).join('\n')
  }).then(
    () => toast({ kind: 'ok', title: t('mail.sent'), text: to, timeout: 4000 }),
    () => toast({ kind: 'err', title: t('mail.fail'), text: t('mail.failX'), timeout: 6000 })
  );
}
