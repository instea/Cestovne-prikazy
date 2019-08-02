const nodemailer = require('nodemailer');
const { getApprovalUrl } = require('./urlService');
const { getUser } = require('../service/userService');
const moment = require('moment');

const areSmtpPropertiesSet = !!process.env.SMTP_HOST && !!process.env.SMTP_PORT && !!process.env.SMTP_USER && !!process.env.SMTP_PASSWORD;
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD
  }
});

const sendPendingLeaveMail = async (leave) => {
  const requester = await getUser(leave.requesterId);
  sendMail(process.env.APPROVAL_MAIL_RECEIVER, 'New leave notification', prepareHtmlBodyForPendingLeave(leave, requester));
};

const prepareHtmlBodyForPendingLeave = (leave, requester) => {
  return '' +
        '<h4>New leave was created and need to be approved.</h4>' +
        '<b>Requester: </b> ' + requester.firstName + ' ' + requester.surname + '<br>' +
        '<b>Days: </b>' + formatDate(leave.startDate) + ' - ' + formatDate(leave.endDate) + '<br>' +
        '<b>Type: </b>' + leave.type + '<br>' +
        '<a href="' + getApprovalUrl() + '">Approve</a>';
};

const sendMail = (receivers, subject, htmlBody) => {
  let mailOptions = {
    from: process.env.MAIL_SENDER,
    to: receivers,
    subject: subject,
    html: htmlBody,
  };
  if (areSmtpPropertiesSet) {
    transporter.sendMail(mailOptions, (error, info) => {
      if (error) {
        return console.log(error);
      }
      console.log('Message %s sent: %s', info.messageId, info.response);
    });
  } else {
    console.log('Email should be send now, but environmental properties for SMTP are not set.');
  }
};

const dateFormatString ='dddd, MMM D, YYYY';
const formatDate = (date) => {
  return moment(date).format(dateFormatString);
};

module.exports = {
  sendPendingLeaveMail
};