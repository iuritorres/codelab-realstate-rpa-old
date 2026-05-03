const { cloudEvent } = require('@google-cloud/functions-framework');
const { google } = require('googleapis');
const { Firestore } = require('@google-cloud/firestore');
const fs = require('fs');

const firestore = new Firestore();
const stateDoc = firestore.collection('rpa-state').doc('gmail-watch');

async function getLastHistoryId() {
  const doc = await stateDoc.get();
  return doc.exists ? doc.data().lastHistoryId : null;
}

async function saveLastHistoryId(historyId) {
  await stateDoc.set({ lastHistoryId: historyId }, { merge: true });
}

cloudEvent('handleNotification', async (event) => {
  const message = event.data?.message;
  if (!message?.data) {
    console.log('No message data');
    return;
  }

  const decoded = JSON.parse(Buffer.from(message.data, 'base64').toString('utf-8'));
  console.log('Received historyId:', decoded.historyId);

  const credentials = JSON.parse(fs.readFileSync('/workspace/token.json', 'utf8'));
  const auth = google.auth.fromJSON(credentials);
  auth.scopes = ['https://www.googleapis.com/auth/gmail.readonly'];

  const gmail = google.gmail({ version: 'v1', auth });

  const lastHistoryId = await getLastHistoryId();
  console.log('Last historyId:', lastHistoryId);

  if (!lastHistoryId) {
    console.log('No lastHistoryId saved yet — saving current and skipping.');
    await saveLastHistoryId(decoded.historyId);
    return;
  }

  const historyResponse = await gmail.users.history.list({
    userId: 'me',
    startHistoryId: lastHistoryId,
    historyTypes: ['messageAdded'],
  });

  await saveLastHistoryId(decoded.historyId);

  for (const history of historyResponse.data.history || []) {
    for (const msg of history.messagesAdded || []) {
      if (!msg.message?.id) continue;
      if (msg.message.labelIds?.includes('DRAFT')) continue;

      const data = await gmail.users.messages.get({ userId: 'me', id: msg.message.id });
      const subject = data.data.payload?.headers?.find(h => h.name === 'Subject')?.value;
      console.log('Subject:', subject);
    }
  }
});
