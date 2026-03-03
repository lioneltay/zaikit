import { Box } from "@mui/material";
import { useLoaderData, useParams } from "@tanstack/react-router";
import { AgentProvider } from "@zaikit/react";
import type { UIMessage } from "ai";
import { useEffect, useState } from "react";
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

  const [showInfo, setShowInfo] = useState(true);
  const [showDebug, setShowDebug] = useState(false);
  const [agentDetail, setAgentDetail] = useState<AgentDetail | null>(null);

  useEffect(() => {
    let stale = false;
    fetchAgentDetail(agentName).then((d) => {
      if (!stale) setAgentDetail(d);
    });
    return () => {
      stale = true;
    };
  }, [agentName]);

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
        >
          <AgentChat
            agentName={agentName}
            agentDetail={agentDetail}
            showDebug={showDebug}
            onToggleDebug={() => setShowDebug((v) => !v)}
            showInfo={showInfo}
            onToggleInfo={() => setShowInfo((v) => !v)}
          />
        </AgentProvider>
      </Box>

      {showInfo && (
        <AgentInfo
          agentDetail={agentDetail}
          onClose={() => setShowInfo(false)}
        />
      )}
    </>
  );
}
