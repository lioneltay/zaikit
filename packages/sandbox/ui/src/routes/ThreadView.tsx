import { Box } from "@mui/material";
import { useLoaderData, useParams } from "@tanstack/react-router";
import { AgentProvider } from "@zaikit/react";
import type { UIMessage } from "ai";
import { useEffect, useMemo, useState } from "react";
import { AgentChat } from "../AgentChat";
import { AgentInfo } from "../AgentInfo";
import {
  type AgentDetail,
  BASE,
  fetchAgentDetail,
  fetchMessages,
} from "../api";

export function ThreadView() {
  const { agentName, threadId } = useParams({ strict: false }) as {
    agentName: string;
    threadId: string;
  };
  const initialMessages = (useLoaderData({ strict: false }) ??
    []) as UIMessage[];

  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [showDebug, setShowDebug] = useState(false);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);

  // Agent context — initialized from runtime defaults returned by the server
  const [agentContext, setAgentContext] = useState<Record<string, unknown>>({});

  useEffect(() => {
    let stale = false;
    fetchAgentDetail(agentName).then((d) => {
      if (!stale) {
        setAgentDetail(d);
        setAgentContext(d.context ?? {});
      }
    });
    return () => {
      stale = true;
    };
  }, [agentName]);

  // Only pass context in body when agent has a context schema
  const body = useMemo(() => {
    if (!agentDetail?.contextSchema) return undefined;
    return { context: agentContext };
  }, [agentDetail?.contextSchema, agentContext]);

  return (
    <>
      <Box
        sx={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}
      >
        <AgentProvider
          key={`${agentName}-${threadId}`}
          api={`${BASE}/agents/${agentName}/chat`}
          threadId={threadId}
          initialMessages={initialMessages}
          fetchMessages={(tid) =>
            fetchMessages(agentName, tid) as Promise<UIMessage[]>
          }
          body={body}
        >
          <AgentChat
            agentName={agentName}
            agentDetail={agentDetail}
            showDebug={showDebug}
            onToggleDebug={() => setShowDebug((v) => !v)}
            showInfo={showInfoDialog}
            onToggleInfo={() => setShowInfoDialog((v) => !v)}
          />
        </AgentProvider>
      </Box>

      <AgentInfo
        agentDetail={agentDetail}
        open={showInfoDialog}
        onClose={() => setShowInfoDialog(false)}
        agentContext={agentContext}
        onAgentContextChange={setAgentContext}
      />
    </>
  );
}
