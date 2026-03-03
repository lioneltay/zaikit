import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
} from "@tanstack/react-router";
import { fetchAgents, fetchMessages } from "./api";
import { AgentLayout } from "./routes/AgentLayout";
import { RootLayout } from "./routes/RootLayout";
import { ThreadView } from "./routes/ThreadView";
import { getBasePath } from "./utils/basepath";

// ---------------------------------------------------------------------------
// Route tree
// ---------------------------------------------------------------------------

const rootRoute = createRootRoute({
  component: RootLayout,
  loader: () => fetchAgents(),
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: async () => {
    const agents = await fetchAgents();
    if (agents.length > 0) {
      throw redirect({
        to: "/$agentName",
        params: { agentName: agents[0].name },
      });
    }
  },
});

const agentRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "$agentName",
  component: AgentLayout,
});

const threadRoute = createRoute({
  getParentRoute: () => agentRoute,
  path: "$threadId",
  component: ThreadView,
  loader: async ({ params }) => {
    try {
      const msgs = await fetchMessages(params.agentName, params.threadId);
      return msgs;
    } catch {
      return [];
    }
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  agentRoute.addChildren([threadRoute]),
]);

// ---------------------------------------------------------------------------
// Router instance
// ---------------------------------------------------------------------------

export const router = createRouter({
  routeTree,
  basepath: getBasePath() || "/",
});

// Register the router type for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
