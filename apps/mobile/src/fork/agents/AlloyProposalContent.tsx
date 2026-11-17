import type { AlloyProposal } from "@t3tools/contracts/alloy";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import { Button } from "../../components/ui/Button";
import * as Dialog from "../../components/ui/Dialog";
import { Muted } from "./AlloyLayout";

type ProposalDecision = "approved" | "rejected" | "noted";

/** A pending proposal's title, rationale and proposed change, with Ben's decision buttons. */
export function ProposalContent(props: {
  readonly proposal: AlloyProposal;
  readonly onDecide: (decision: ProposalDecision, note: string | null) => void;
}) {
  const { proposal, onDecide } = props;
  const reject = () =>
    Dialog.prompt({
      title: "Reject proposal",
      message: "Optionally tell the agent why. The reason becomes a lesson.",
      placeholder: "Reason",
      initialValue: "",
      confirmText: "Reject",
      onConfirm: (reason) => onDecide("rejected", reason.trim() || null),
    });
  const roadmap = proposal.body._tag === "roadmap" ? proposal.body.milestones : null;
  const vision = proposal.body._tag === "vision" ? proposal.body.vision : null;
  return (
    <View className="gap-3">
      <Text textRole="body" className="font-t3-bold text-foreground">
        {proposal.title}
      </Text>
      {proposal.rationale ? <Muted>{proposal.rationale}</Muted> : null}
      {vision === null ? null : (
        <Text textRole="body" className="text-foreground">
          {vision}
        </Text>
      )}
      {roadmap ? (
        <View className="gap-2">
          {roadmap.map((item, index) => (
            <View key={`${item.title}\u0000${item.doneWhen}`} className="flex-row gap-2">
              <Text textRole="footnote" className="w-5 text-right text-foreground-muted">
                {`${index + 1}.`}
              </Text>
              <View className="min-w-0 flex-1">
                <Text textRole="footnote" className="text-foreground">
                  {item.title}
                </Text>
                {item.doneWhen ? <Muted>{item.doneWhen}</Muted> : null}
              </View>
            </View>
          ))}
        </View>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Button
          label="Approve"
          tone="primary"
          size="compact"
          onPress={() => onDecide("approved", null)}
        />
        {proposal.body._tag === "idea" ? (
          <Button
            label="Noted"
            tone="secondary"
            size="compact"
            onPress={() => onDecide("noted", null)}
          />
        ) : null}
        <Button label="Reject" tone="danger" size="compact" onPress={reject} />
      </View>
    </View>
  );
}
