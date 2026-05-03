import { env } from "./env";
import { TEST_LABEL_ID } from "./google/constants/gmail";
import { getGmailClient } from "./google/gmail/client";
import { getLastHistoryId } from "./google/gmail/utils/getLastHistoryId";
import { getNegotiationsLabel } from "./google/gmail/utils/getNegotiationsLabel";
import { saveLastHistoryId } from "./google/gmail/utils/saveLastHistoryId";
import { RealStateCategory } from "./notion/enums/notion";
import { createInvestmentRecord } from "./notion/utils/createInvestmentRecord";
import { getInvestmentAmountFromPDF } from "./utils/getInvestmentAmountFromPDF";

export async function handleGmailNotification(encodedData: string) {
  const decodedData = JSON.parse(
    Buffer.from(encodedData, "base64").toString("utf-8"),
  );

  const historyId: string | undefined = decodedData.historyId;
  if (!historyId) {
    console.error("No historyId in data");
    return;
  }

  const gmail = await getGmailClient();
  const negotiationsLabel = await getNegotiationsLabel({ gmail });
  const lastHistoryId = await getLastHistoryId();

  const historyResponse = await gmail.users.history.list({
    userId: "me",
    startHistoryId: lastHistoryId,
    labelId: negotiationsLabel.id!,
    historyTypes: ["messageAdded"],
  });

  await saveLastHistoryId(historyResponse.data.historyId!);

  const histories = historyResponse.data.history || [];

  for (const history of histories) {
    const messages = history.messages || [];
    console.log(`${messages.length} new messages found in history.`);

    for (const message of messages) {
      const messageData = await gmail.users.messages.get({
        userId: "me",
        id: message.id!,
      });

      const headers = messageData.data.payload?.headers || [];
      const labels = messageData.data.labelIds || [];
      const subject =
        headers.find((h) => h.name === "Subject")?.value || "(sem título)";

      const isNegotiation = labels.includes(negotiationsLabel.id!);
      const isTest = labels.includes(TEST_LABEL_ID);

      if (!isNegotiation && !isTest) {
        continue;
      }

      console.log("New negotiation email found:", subject);

      const parts = messageData.data.payload?.parts || [];
      const pdfPart = parts.find(
        (part) =>
          part.filename?.endsWith(".pdf") &&
          part.mimeType === "application/pdf" &&
          part.body?.attachmentId,
      );

      if (!pdfPart) {
        console.error("PDF attachment not found in email.");
        continue;
      }

      const attachment = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId: message.id!,
        id: pdfPart.body!.attachmentId!,
      });

      const dataBase64 = attachment.data?.data;
      if (!dataBase64) {
        console.error("No data found in attachment.");
        continue;
      }

      const pdfData = new Uint8Array(Buffer.from(dataBase64, "base64"));

      const investmentAmount = await getInvestmentAmountFromPDF({
        pdfData,
        password: env.PDF_PASSWORD,
      });

      await createInvestmentRecord({
        category: RealStateCategory.INVESTMENT,
        amount: investmentAmount,
        date: new Date(),
      });

      await gmail.users.messages.modify({
        userId: "me",
        id: message.id!,
        requestBody: {
          removeLabelIds: ["UNREAD"],
        },
      });
    }
  }
}
