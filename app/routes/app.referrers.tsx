import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import { Form, useLoaderData, useNavigation } from "@remix-run/react";
import { Page, Card, IndexTable, Text, Badge, Button, BlockStack, InlineStack, Banner } from "@shopify/polaris";
import { authenticate } from "app/shopify.server";
import { listReferrersWithStats } from "app/services/referrers.server";
import { processRewardRefund } from "app/services/rewards.server";

const currencyFormatter = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
});

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
});

type LoaderData = {
  referrers: Array<{
    id: string;
    name: string;
    email: string | null;
    shopifyCustomerId: string;
    latestCode: string | null;
    latestCodeCreatedAt: string | null;
    latestWorkshop: string | null;
    totalCodes: number;
    totalReferrals: number;
    pendingRewardsAmount: number;
    pendingRewardsCount: number;
    paidRewardsAmount: number;
    createdAt: string;
    nextPendingRewardId: string | null;
  }>;
  flash: { type: "success" | "error"; message: string } | null;
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);

  const url = new URL(request.url);
  const hasSuccess = url.searchParams.get("success") === "1";
  const errorMessage = url.searchParams.get("error");

  const referrers = (await listReferrersWithStats(100)).map((summary) => ({
    id: summary.id,
    name: summary.name,
    email: summary.email ?? null,
    shopifyCustomerId: summary.shopifyCustomerId,
    latestCode: summary.latestCode,
    latestCodeCreatedAt: summary.latestCodeCreatedAt ? summary.latestCodeCreatedAt.toISOString() : null,
    latestWorkshop: summary.latestWorkshop ?? null,
    totalCodes: summary.totalCodes,
    totalReferrals: summary.totalReferrals,
    pendingRewardsAmount: summary.pendingRewardsAmount,
    pendingRewardsCount: summary.pendingRewardsCount,
    paidRewardsAmount: summary.paidRewardsAmount,
    createdAt: summary.createdAt.toISOString(),
    nextPendingRewardId: summary.nextPendingRewardId,
  }));

  const flash = hasSuccess
    ? { type: "success" as const, message: "Refund accepté pour le parrain." }
    : errorMessage
      ? { type: "error" as const, message: errorMessage }
      : null;

  return json<LoaderData>({ referrers, flash });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);

  const formData = await request.formData();
  const rewardId = formData.get("rewardId");

  if (typeof rewardId !== "string" || !rewardId) {
    return redirect("/app/referrers?error=" + encodeURIComponent("Identifiant de récompense manquant."));
  }

  try {
    await processRewardRefund({
      rewardId,
      shopDomain: session?.shop,
    });
    return redirect("/app/referrers?success=1");
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Erreur inattendue lors du déclenchement du refund.";
    return redirect("/app/referrers?error=" + encodeURIComponent(message));
  }
};

export default function ReferrersPage() {
  const { referrers, flash } = useLoaderData<typeof loader>();

  return (
    <Page title="Parrains">
      <BlockStack gap="400">
        {flash && (
          <Banner tone={flash.type === "success" ? "success" : "critical"}>
            {flash.message}
          </Banner>
        )}
        <Card>
          <BlockStack gap="300">
            <Text variant="bodyMd" as="p" tone="subdued">
              Liste de tous les parrains enregistrés dans le système. Visualisez leurs codes générés, leurs parrainages effectués et leurs récompenses en attente ou payées.
            </Text>
          </BlockStack>
        </Card>
        <Card>
          <IndexTable
            resourceName={{ singular: "parrain", plural: "parrains" }}
            itemCount={referrers.length}
            selectable={false}
            headings={[
              { title: "Parrain" },
              { title: "Dernier workshop" },
              { title: "Dernier code" },
              { title: "Généré le" },
              { title: "Parrainages" },
              { title: "Récompenses en attente" },
              { title: "Actions" },
            ]}
          >
            {referrers.map((referrer, index) => (
              <IndexTable.Row id={referrer.id} key={referrer.id} position={index}>
                <IndexTable.Cell>
                  <Text variant="bodyMd" fontWeight="bold" as="h3">
                    {referrer.name}
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    {referrer.email ?? referrer.shopifyCustomerId}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>{referrer.latestWorkshop ?? "—"}</IndexTable.Cell>
                <IndexTable.Cell>{referrer.latestCode ?? "—"}</IndexTable.Cell>
                <IndexTable.Cell>
                  {referrer.latestCodeCreatedAt
                    ? dateFormatter.format(new Date(referrer.latestCodeCreatedAt))
                    : "—"}
                </IndexTable.Cell>
                <IndexTable.Cell>{referrer.totalReferrals}</IndexTable.Cell>
                <IndexTable.Cell>
                  <Badge tone={referrer.pendingRewardsCount > 0 ? "attention" : "success"}>
                    {currencyFormatter.format(referrer.pendingRewardsAmount)}
                  </Badge>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <InlineStack gap="200" align="start">
                  <Button url={`/app/parrain/${referrer.id}`} variant="primary">
                    Détails
                  </Button>
                  </InlineStack>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>
      </BlockStack>
    </Page>
  );
}
