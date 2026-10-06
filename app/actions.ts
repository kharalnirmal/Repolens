"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";

export type InviteState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export async function inviteMember(
  _previousState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { has, orgId, userId } = await auth();

  if (!userId || !orgId || !has({ role: "org:admin" })) {
    return { status: "error", message: "Not authorized" };
  }

  const emailValue = formData.get("email");
  const emailAddress =
    typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";

  if (!/^\S+@\S+\.\S+$/.test(emailAddress)) {
    return { status: "error", message: "Enter a valid email" };
  }

  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: orgId,
      inviterUserId: userId,
      emailAddress,
      role: "org:member",
      redirectUrl: "/sign-in",
    });

    return { status: "success", message: "Invitation sent" };
  } catch {
    return { status: "error", message: "Could not send invitation" };
  }
}
