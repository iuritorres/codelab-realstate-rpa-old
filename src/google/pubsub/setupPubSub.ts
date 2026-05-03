import { PubSub } from "@google-cloud/pubsub";
import { env } from "../../env";

export async function setupPubSub() {
  const pubsub = new PubSub({ projectId: env.GOOGLE_PROJECT_ID });

  const [topic] = await pubsub
    .topic(env.GOOGLE_PUBSUB_TOPIC)
    .get({ autoCreate: true });

  const [subscriptions] = await topic.getSubscriptions();

  if (!!subscriptions.length) {
    console.log("✅ Subscription already exists. No changes made.");
    return;
  }

  await topic.createSubscription(env.GOOGLE_PUBSUB_SUBSCRIPTION, {
    ackDeadlineSeconds: 60,
    expirationPolicy: {
      ttl: null,
    },
  });

  console.log("✅ Successfully created Pub/Sub topic and subscription.");
}
