'use strict'

var MailListener = require("mail-listener2")
const settings = require('standard-settings').getSettings()
settings.service.mail.debug = console.log
var mailListener = new MailListener(settings.service.mail)
var admin = require("firebase-admin")
const format = require('util').format
const uuid = require('uuid')
const gm = require('gm').subClass({imageMagick: true})


var serviceAccount = require(settings.service.firebase.key.path)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: `https://${settings.service.firebase.database.name}.firebaseio.com`,
  storageBucket: `${settings.service.storage.name}.appspot.com`,
})

const bucket = admin.storage().bucket()

mailListener.start() // start listening

mailListener.on("server:connected", ()=>{
  console.log("imapConnected")
})

mailListener.on("server:disconnected", ()=>{
  console.log("imapDisconnected")
  mailListener.start()
})

mailListener.on("error", (err) => {
  console.log(err)
})

mailListener.on("mail", (mail, seqno, attributes) => {
  if(mail.attachments){
    uploadFile(mail.attachments[0], mail.from, mail.subject, mail.html)
  }
  console.log("emailParsed", mail.attachments)
  console.log("emailParsed", mail.from)
  console.log("emailParsed", mail.subject)
})

mailListener.on("attachment", function(attachment){
  console.log(attachment.path)
})

let uploadFile = (file, from, subject, html) => {
  const blob = bucket.file(file.fileName)
  const blobStream = blob.createWriteStream()
  subject = subject || 'no subject' 
  blobStream.on('error', (err) => {
    console.error('error', err)
  });

  blobStream.on('finish', () => {
    const publicUrl = format(`https://storage.googleapis.com/${bucket.name}/${blob.name}`);
    console.log(publicUrl)
    bucket.file(file.fileName).makePublic()
    .then(() => {
      console.log(`gs://${bucket.name}/${file.fileName} is now public.`)
      writeNewMail(publicUrl, subject, from[0], html)
    })
    .catch((err) => {
      console.error('ERROR:', err);
    })
  });
  // auto-orient an image
  gm(file.content, file.fileName)
  .autoOrient()
  .toBuffer('JPG',function (err, buffer) {
    if (err) {
      console.error('An error occured while trying to orient', err)
    } else {
      blobStream.end(buffer)    
    }
  })
}

function writeNewMail(imageUrl, body, author, html) {
  var postData = {
    uid: uuid.v4(),
    body: body,
    author: author,
    createdAt: admin.database.ServerValue.TIMESTAMP,
    display: true,
    image:{
      url: imageUrl
    },
    html: html
  }
  let root = 'mail'
  var newPostKey = admin.database().ref().child(root).push().key
  var updates = {}
  updates[`/${root}/` + newPostKey] = postData
  return admin.database().ref().update(updates)
}