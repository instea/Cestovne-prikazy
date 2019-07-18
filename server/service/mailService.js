const nodemailer = require('nodemailer');
const { getUser } = require('../service/userService');
const moment = require('moment');

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
    const BASE_URL = process.env.BASE_URL;
    const APPROVAL_PAGE_URL = BASE_URL + '/approval';
    return '' +
        '<h4>New leave was created and need to be approved.</h4>' +
        '<b>Requester: </b> ' + requester.firstName + ' ' + requester.surname + '<br>' +
        '<b>Days: </b>' + formatDate(leave.startDate) + ' - ' + formatDate(leave.endDate) + '<br>' +
        '<b>Type: </b>' + leave.type + '<br>' +
        ((APPROVAL_PAGE_URL) ? '<a href="' + APPROVAL_PAGE_URL + '">Approve</a>' : '');
};

const sendMail = (receivers, subject, htmlBody) => {
    let mailOptions = {
        from: process.env.MAIL_SENDER,
        to: receivers,
        subject: subject,
        html: htmlBody,
    };
    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            return console.log(error);
        }
        console.log('Message %s sent: %s', info.messageId, info.response);
    })
};

const dateFormatString ='dddd, MMM D, YYYY';
const formatDate = (date) => {
    return moment(date).format(dateFormatString);
};

module.exports = {
    sendPendingLeaveMail
};