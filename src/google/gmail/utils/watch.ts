import { env } from "../../../env";
import { TEST_LABEL_ID } from "../../constants/gmail";
import { getGmailClient } from "../client";
import { getNegotiationsLabel } from "./getNegotiationsLabel";
import { saveLastHistoryId } from "./saveLastHistoryId";

export const subscribeToGmailPushNotifications = async () => {
  const gmail = await getGmailClient();
  const negotiationsLabel = await getNegotiationsLabel({ gmail });

  const response = await gmail.users.watch({
    userId: "me",
    requestBody: {
      topicName: `projects/${env.GOOGLE_PROJECT_ID}/topics/${env.GOOGLE_PUBSUB_TOPIC}`,
      labelIds: [negotiationsLabel.id!, TEST_LABEL_ID],
      labelFilterAction: "include",
    },
  });

  await saveLastHistoryId(response.data.historyId!);

  console.log("📬 Subscribed to Gmail push notifications.");
};

export const unsubscribeFromGmailPushNotifications = async () => {
  const gmail = await getGmailClient();

  await gmail.users.stop({
    userId: "me",
  });

  console.log("📭 Unsubscribed from Gmail push notifications.");
};
