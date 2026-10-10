import { verifyWebhook } from "@clerk/nextjs/webhooks";
import type { NextRequest } from "next/server";

import {
  deleteClerkOrganization,
  reconcileClerkOrganization,
} from "@/lib/organizations/sync";

export async function POST(request: NextRequest): Promise<Response> {
  const signingSecret = process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!signingSecret?.trim()) {
    console.error("Missing required environment variable: CLERK_WEBHOOK_SIGNING_SECRET");
    return new Response("Webhook verification is not configured", { status: 500 });
  }

  let event;
  try {
    event = await verifyWebhook(request, { signingSecret });
  } catch (error) {
    console.error("Clerk webhook verification failed", error);
    return new Response("Invalid webhook signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "organization.created":
      case "organization.updated": {
        await reconcileClerkOrganization(event.data.id);
        break;
      }
      case "organization.deleted":
        if (!event.data.id) {
          throw new Error("Verified organization deletion has no organization ID");
        }
        await deleteClerkOrganization(event.data.id);
        break;
    }
  } catch (error) {
    console.error("Clerk organization synchronization failed", error);
    return new Response("Could not synchronize organization", { status: 500 });
  }

  return new Response("Webhook received", { status: 200 });
}
