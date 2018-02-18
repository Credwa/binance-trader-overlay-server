require('../config/config.js');

const admin = require('firebase-admin');

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.project_id,
    clientEmail: process.env.client_email,
    privateKey: process.env.private_key
  }),
  databaseURL: process.env.database_URL
});
const db = admin.database();
let refTrail= db.ref(`${process.env.db_name}/active-trailing-stop-sells`);
let refKeys = db.ref(`${process.env.db_name}/keys`)
module.exports = {
  refTrail,
  refKeys
};
