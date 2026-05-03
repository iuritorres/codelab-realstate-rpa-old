import { subscribeToGmailPushNotifications } from "../google/gmail/utils/watch";

subscribeToGmailPushNotifications().catch((error) => {
  console.error(error);
  process.exit(1);
});
