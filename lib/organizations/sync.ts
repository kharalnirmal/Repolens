import "server-only";

import { isClerkAPIResponseError } from "@clerk/nextjs/errors";
import { clerkClient } from "@clerk/nextjs/server";

import { createPrivilegedSupabaseClient } from "@/lib/supabase/server";

type ClerkOrganization = {
  id: string;
  name: string;
};

export async function upsertClerkOrganization(
  organization: ClerkOrganization,
): Promise<void> {
  const { error } = await createPrivilegedSupabaseClient()
    .from("organizations")
    .upsert(organization, { onConflict: "id" });

  if (error) {
    throw new Error(`Could not synchronize organization: ${error.message}`);
  }
}

export async function deleteClerkOrganization(
  organizationId: string,
): Promise<void> {
  const { error } = await createPrivilegedSupabaseClient()
    .from("organizations")
    .delete()
    .eq("id", organizationId);

  if (error) {
    throw new Error(`Could not delete organization: ${error.message}`);
  }
}

export async function reconcileClerkOrganization(
  organizationId: string,
): Promise<boolean> {
  const client = await clerkClient();
  let organization;

  try {
    organization = await client.organizations.getOrganization({ organizationId });
  } catch (error) {
    if (isClerkAPIResponseError(error) && error.status === 404) {
      await deleteClerkOrganization(organizationId);
      return false;
    }
    throw error;
  }

  await upsertClerkOrganization({
    id: organization.id,
    name: organization.name,
  });

  try {
    await client.organizations.getOrganization({ organizationId });
  } catch (error) {
    if (isClerkAPIResponseError(error) && error.status === 404) {
      await deleteClerkOrganization(organizationId);
      return false;
    }
    throw error;
  }

  return true;
}
